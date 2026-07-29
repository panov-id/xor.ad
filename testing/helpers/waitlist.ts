import { RELAY_URL } from "./env";
import { mintAdminToken } from "./token";

export interface WaitlistRow {
  email: string;
  source: string | null;
  brand: string | null;
  early_access: boolean;
}

let session: Promise<string> | null = null;
const asAdmin = (): Promise<string> => (session ??= mintAdminToken());

// Reads a lead back through the same admin route the panel uses, so the check
// proves the submission reached the node — not merely that the form said "done".
//
// The route answers with every lead the caller's scope can see; a platform token
// sees both faces. Fine at a local stand's volume, and it keeps the suite off any
// privileged path into storage.
export async function findWaitlistRow(email: string): Promise<WaitlistRow | null> {
  const response = await fetch(`${RELAY_URL}/admin/waitlist`, {
    headers: { authorization: `Bearer ${await asAdmin()}` },
  });
  if (!response.ok) {
    throw new Error(`reading the waitlist failed: ${response.status} ${await response.text()}`);
  }
  const rows = (await response.json()) as WaitlistRow[];
  return rows.find((row) => row.email === email) ?? null;
}

// No cleanup counterpart on purpose: the node exposes no delete, because a lead
// is not something an operator should be able to quietly remove. Every test email
// is unique, so runs never collide; the stand's leads are cleared by wiping
// relay/local/data when they get in the way.

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}
