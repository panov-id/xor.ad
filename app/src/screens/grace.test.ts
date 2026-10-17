// The reload grace as the app reads it (depth/core/grace.ts, the SDK's, shared with the web): a reload within the window
// of the last input opens without the PIN; after it, in a duplicate tab, or once spent, the PIN is asked.
// The web's own tests of the same file are web/src/grace.test.ts; this is what the unlock gate depends on.
import assert from "node:assert/strict";
import { test } from "node:test";
import { arm, GRACE_MS, type GraceDeps, type KeyStore, leaving, take, type TabStore } from "../../../depth/core/grace.ts";

function stores(): { deps: (now: number) => GraceDeps; tab: Map<string, string> } {
  const tabMap = new Map<string, string>();
  const tab: TabStore = { getItem: (k) => tabMap.get(k) ?? null, setItem: (k, v) => void tabMap.set(k, v), removeItem: (k) => void tabMap.delete(k) };
  const rows = new Map<string, { key: CryptoKey; at: number }>();
  const keys: KeyStore = {
    put: async (id, row) => void rows.set(id, row),
    take: async (id) => { const row = rows.get(id); rows.delete(id); return row; },
    prune: async (before) => { for (const [id, row] of rows) if (row.at < before) rows.delete(id); },
    clear: async () => rows.clear(),
  };
  return { deps: (now) => ({ tab, keys, now: () => now }), tab: tabMap };
}
const halves = () => ({ local: new Uint8Array(32).fill(1), share: new Uint8Array(32).fill(2) });

test("a reload within the window gets the halves back, once", async () => {
  const s = stores(), h = halves();
  await arm(h.local, h.share, s.deps(1_000));
  leaving(s.deps(1_000));
  const got = await take(s.deps(1_000 + GRACE_MS - 1));
  assert.ok(got && got.local[0] === 1 && got.share[0] === 2);
  assert.equal(await take(s.deps(1_000 + GRACE_MS - 1)), null, "the grace is spent: a second reload asks the PIN");
});
test("after the window the PIN is asked", async () => {
  const s = stores(), h = halves();
  await arm(h.local, h.share, s.deps(1_000));
  leaving(s.deps(1_000));
  assert.equal(await take(s.deps(1_000 + GRACE_MS + 1)), null);
});
test("a duplicated tab (no leave mark, as a reload writes one) asks the PIN", async () => {
  const s = stores(), h = halves();
  await arm(h.local, h.share, s.deps(1_000));
  assert.equal(await take(s.deps(1_500)), null);
});
