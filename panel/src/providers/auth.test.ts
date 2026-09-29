// Who the session is: /auth/me, asked once and shared. A refusal (401, 403) is
// an answer and is kept; anything else — a 5xx, a 429, a dropped connection —
// is not an answer about the session, and keeping it made one slow moment of
// the relay a sign-out for the rest of the tab: the access checks read the
// kept null, the menu drew nothing, and check() sent the operator to /login
// (the panel's "admin invites a moderator" waited 30 s for a link that never
// came, under a load of ~70 containers, 28.09.2026).

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

const { forgetIdentity, loadIdentity } = await import("./auth");

const ME = { id: "u1", email: "admin@test.seed", role: "admin", brand: null, permissions: ["panel_users.write"] };

function answers(...replies: Array<number | "drop">) {
  const fetchMock = vi.fn(async () => {
    const reply = replies.shift() ?? 200;
    if (reply === "drop") throw new TypeError("Failed to fetch");
    return reply === 200 ? new Response(JSON.stringify(ME)) : new Response("{}", { status: reply });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("the session's identity", () => {
  beforeEach(() => {
    forgetIdentity();
    store.clear();
    store.set("panel_jwt", "jwt-value");
  });

  it("is asked once and shared", async () => {
    const fetchMock = answers(200);
    const [a, b] = await Promise.all([loadIdentity(), loadIdentity()]);
    expect(a?.email).toBe(ME.email);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("outlives a relay that answered 503 once", async () => {
    answers(503, 200);
    expect((await loadIdentity())?.email, "one 503 became the session's answer").toBe(ME.email);
  });

  it("outlives a connection dropped once", async () => {
    answers("drop", 200);
    expect((await loadIdentity())?.email, "one dropped request became the session's answer").toBe(ME.email);
  });

  it("keeps a refusal: 401 is the session's answer, asked no further", async () => {
    const fetchMock = answers(401, 200);
    expect(await loadIdentity()).toBeNull();
    expect(await loadIdentity()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after a relay that keeps failing, and asks again next time", async () => {
    const fetchMock = answers(503, 503, 503, 200);
    expect(await loadIdentity()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((await loadIdentity())?.email, "a failure was kept as the answer").toBe(ME.email);
  });
});
