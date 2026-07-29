// Test fixtures against the relay control plane. Everything here goes through
// the same /admin routes the panel itself uses — the suite has no privileged
// side door into storage, so a fixture that stops working is a route that
// stopped working, which is the point.

import { ADMIN_EMAIL, MODERATOR_EMAIL, RELAY_URL } from "./env";
import { mintToken } from "./token";

// One platform-admin session for every fixture call. Minted lazily so importing
// this module costs nothing, and reused so a suite does not re-sign per request.
let session: Promise<string> | null = null;
const asAdmin = (): Promise<string> => (session ??= mintToken(ADMIN_EMAIL, "admin"));

async function relay(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${await asAdmin()}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return await fetch(`${RELAY_URL}${path}`, { ...init, headers });
}

async function ensurePanelUser(email: string, role: "admin" | "moderator"): Promise<void> {
  const response = await relay("/admin/panel-users", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  // 409 — already there from an earlier run. The stand is long-lived and the
  // fixtures are fixed identities, so "already exists" is the normal case, not
  // a failure.
  if (response.ok || response.status === 409) return;
  throw new Error(`seeding ${email} failed: ${response.status} ${await response.text()}`);
}

async function ensureWaitlistRow(email: string, source: string): Promise<void> {
  // The public route, exactly as a landing calls it. The node dedups on the
  // hashed email, so re-running the suite adds nothing and sends no second
  // welcome — which is why these rows are never cleaned up.
  const response = await fetch(`${RELAY_URL}/waitlist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, source, early_access: true }),
  });
  if (!response.ok) {
    throw new Error(`seeding waitlist ${email} failed: ${response.status} ${await response.text()}`);
  }
}

export async function seedTestData(): Promise<void> {
  await ensurePanelUser(ADMIN_EMAIL, "admin");
  await ensurePanelUser(MODERATOR_EMAIL, "moderator");

  // One lead per face, so the list has both brand badges to show. The brand is
  // resolved from `source` the way it is for a real signup — the caller does not
  // get to name it.
  await ensureWaitlistRow("alice@test.seed", "sosed.place-landing");
  await ensureWaitlistRow("bob@test.seed", "neighbro.place-landing");
}

// Removes a panel user an invite test created, so re-runs start clean. A user
// who is not there is not an error: the test may have failed before inviting.
export async function removePanelUserByEmail(email: string): Promise<void> {
  const response = await relay(`/admin/panel-users/${encodeURIComponent(email)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`removing ${email} failed: ${response.status} ${await response.text()}`);
  }
}
