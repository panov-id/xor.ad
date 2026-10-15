// grace.ts: the reload grace's rules over in-memory stores (owner 14.10.2026:
// no PIN on a reload within 30 s of the last input; the PIN after 30 s, in a
// new tab, after the lock or «forget»; security review 15.10.2026: nothing on
// the disk once the input is stale, orphans swept, one taker wins, a
// duplicate tab refused). scripts/run-web-unit-tests.sh, node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arm, type Clock, drop, GO_KEY, GRACE_MS, type GraceDeps, Keeper, type KeyStore, leaving, REFRESH_MS, returning, STAMP_KEY, stamp, sweep,
  TAB_KEY, type TabStore, take,
} from "./grace.ts";

function tabStore(): TabStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

// The shared store, with `take` atomic as the IndexedDB one is: get and
// delete in one step, no await between them.
function keyStore(): KeyStore & { map: Map<string, { key: CryptoKey; at: number }>; takes: number } {
  const map = new Map<string, { key: CryptoKey; at: number }>();
  const store = {
    map,
    takes: 0,
    put: async (id: string, row: { key: CryptoKey; at: number }) => void map.set(id, row),
    take: async (id: string) => { store.takes++; const row = map.get(id); map.delete(id); return row; },
    prune: async (before: number) => { for (const [id, row] of map) if (row.at < before) map.delete(id); },
    clear: async () => map.clear(),
  };
  return store;
}

const halves = () => ({ local: crypto.getRandomValues(new Uint8Array(32)), share: crypto.getRandomValues(new Uint8Array(32)) });

// A clock to move by hand: timers fire when `advance` passes their moment.
function fakeClock(start = 1_000_000): Clock & { advance(ms: number): void; pending: number } {
  let now = start;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (h) => void timers.delete(h as number),
    get pending() { return timers.size; },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
  };
}

// One device, one tab: the clock, the tab's storage and the shared key store.
function device() {
  const clock = fakeClock();
  const tab = tabStore();
  const keys = keyStore();
  const deps: GraceDeps = { tab, keys, now: () => clock.now() };
  return { clock, tab, keys, deps };
}

// What a reload does between the two documents: pagehide, then a new document.
const reload = (deps: GraceDeps) => leaving(deps);

test("a reload within 30 s of the last input gives the halves back, once", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  assert.ok(!d.tab.map.get(TAB_KEY)!.includes(Buffer.from(local).toString("base64url")), "the local half lies in the tab in the clear");
  d.clock.advance(GRACE_MS - 1);
  reload(d.deps);
  const got = await take(d.deps);
  assert.ok(got, "no grace within the window");
  assert.deepEqual([...got.local], [...local]);
  assert.deepEqual([...got.share], [...share]);
  reload(d.deps);
  assert.equal(await take(d.deps), null, "a second take after the first got the halves again");
  assert.equal(d.keys.map.size, 0, "the key stayed in the store after the take");
});

test("the window counts from the last input, not from the arming", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  d.clock.advance(GRACE_MS * 3);
  stamp(d.deps);
  d.clock.advance(GRACE_MS / 2);
  reload(d.deps);
  assert.ok(await take(d.deps), "the input stamp did not extend the grace");
});

test("after 30 s without input the PIN is asked: no halves, and nothing left behind", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  d.clock.advance(GRACE_MS + 1);
  reload(d.deps);
  assert.equal(await take(d.deps), null, "the grace outlived the 30 s");
  assert.equal(d.tab.map.has(TAB_KEY), false, "the ciphertext stayed in the tab");
  assert.equal(d.tab.map.has(GO_KEY), false, "the leave mark stayed in the tab");
  assert.equal(d.keys.map.size, 0, "the key stayed in the store");
});

test("a stamp from the future, or none, is no grace", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  d.tab.map.set(STAMP_KEY, String(d.clock.now() + 5_000));
  reload(d.deps);
  assert.equal(await take(d.deps), null, "a future stamp opened the grace");
  await arm(local, share, d.deps);
  d.tab.map.delete(STAMP_KEY);
  reload(d.deps);
  assert.equal(await take(d.deps), null, "a missing stamp opened the grace");
});

test("the lock and «forget» drop the grace at once", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  await drop(d.deps);
  reload(d.deps);
  assert.equal(await take(d.deps), null, "the grace survived drop()");
  assert.equal(d.tab.map.size, 0);
  assert.equal(d.keys.map.size, 0);
});

test("a new tab shares the key store but not the tab's ciphertext: the PIN is asked", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  const other: GraceDeps = { tab: tabStore(), keys: d.keys, now: d.deps.now };
  reload(other);
  assert.equal(await take(other), null, "another tab got the grace");
  assert.equal(d.keys.map.size, 1, "another tab's empty take threw the first tab's key away");
  reload(d.deps);
  assert.ok(await take(d.deps), "the first tab lost its grace to the other's look");
});

test("a duplicate tab copies the ciphertext but not the leave mark: refused, and G is spent", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  // «Duplicate tab»: sessionStorage copied while the document lives — no pagehide, no mark.
  const dup = tabStore();
  for (const [k, v] of d.tab.map) dup.map.set(k, v);
  assert.equal(dup.map.has(GO_KEY), false);
  assert.equal(await take({ ...d.deps, tab: dup }), null, "a duplicate tab got the grace");
  assert.equal(d.keys.map.size, 0, "the duplicate's refused take left G for a second try");
  // The original, reloaded after: G is gone, the PIN.
  reload(d.deps);
  assert.equal(await take(d.deps), null);
});

test("two documents with one ciphertext take at once: exactly one wins", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  const copy = tabStore();
  for (const [k, v] of d.tab.map) copy.map.set(k, v);
  reload(d.deps);
  reload({ tab: copy });
  const [a, b] = await Promise.all([take(d.deps), take({ ...d.deps, tab: copy })]);
  assert.equal([a, b].filter(Boolean).length, 1, "the two takers did not end one to one");
  assert.equal(d.keys.takes, 2);
  assert.equal(d.keys.map.size, 0);
});

test("a tab whose key the store no longer has gets nothing, and a stand's 0 ms means no grace", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  d.keys.map.clear();
  reload(d.deps);
  assert.equal(await take(d.deps), null, "a ciphertext without its key opened");
  await arm(local, share, d.deps);
  reload(d.deps);
  assert.equal(await take({ ...d.deps, graceMs: 0 }), null, "0 ms gave a grace");
});

test("sweep: rows of tabs that died mid-window go, a row in use stays", async () => {
  const d = device();
  const { local, share } = halves();
  const dead = await arm(local, share, { ...d.deps, tab: tabStore() });
  d.clock.advance(GRACE_MS + REFRESH_MS + 1);
  const live = await arm(local, share, d.deps);
  await sweep(d.deps);
  assert.equal(d.keys.map.has(dead.id), false, "the orphan row survived the sweep");
  assert.equal(d.keys.map.has(live.id), true, "the live row was swept");
});

test("Keeper: 30 s after the last input nothing is on the disk; the next input arms it again from memory", async () => {
  const d = device();
  const keeper = new Keeper(d.deps, d.clock);
  const { local, share } = halves();
  await keeper.hold(local, share);
  assert.equal(d.keys.map.size, 1);
  assert.ok(d.tab.map.has(TAB_KEY));
  d.clock.advance(GRACE_MS - 1);
  await keeper.touch();
  d.clock.advance(GRACE_MS - 1);
  assert.equal(d.keys.map.size, 1, "the input did not start the clock over");
  d.clock.advance(2);
  // The timer fired inside advance(); its suspend runs through the queue.
  await keeper.settled();
  assert.equal(d.keys.map.size, 0, "G stayed on the disk after the window");
  assert.equal(d.tab.map.has(TAB_KEY), false, "the ciphertext stayed in the tab after the window");
  assert.equal(d.tab.map.has(STAMP_KEY), false);
  assert.equal(keeper.armed, false);
  await keeper.touch();
  assert.equal(keeper.armed, true, "the next input did not arm the grace again");
  assert.equal(d.keys.map.size, 1);
  reload(d.deps);
  const got = await take(d.deps);
  assert.ok(got, "the re-armed grace does not open");
  assert.deepEqual([...got.local], [...local]);
});

test("Keeper: release wipes the memory, so no input arms anything again", async () => {
  const d = device();
  const keeper = new Keeper(d.deps, d.clock);
  const { local, share } = halves();
  await keeper.hold(local, share);
  await keeper.release();
  assert.equal(d.keys.map.size, 0);
  assert.equal(d.tab.map.size, 0);
  assert.equal(d.clock.pending, 0, "a timer survived the release");
  await keeper.touch();
  assert.equal(keeper.armed, false, "an input after the release armed the grace");
  assert.equal(d.keys.map.size, 0);
});

test("Keeper: the row's age is refreshed while the tab is in use, so the sweep keeps it", async () => {
  const d = device();
  const keeper = new Keeper(d.deps, d.clock);
  const { local, share } = halves();
  await keeper.hold(local, share);
  for (let i = 0; i < 10; i++) {
    d.clock.advance(REFRESH_MS);
    await keeper.touch();
  }
  await sweep(d.deps);
  assert.equal(d.keys.map.size, 1, "the row of a tab in use was swept");
  const [row] = d.keys.map.values();
  assert.equal(row.at, d.clock.now());
});

test("Keeper: the tab hidden or frozen — suspend clears G and the tab's keys at once, the halves stay for the next input", async () => {
  const d = device();
  const keeper = new Keeper(d.deps, d.clock);
  const { local, share } = halves();
  await keeper.hold(local, share);
  d.clock.advance(1000);
  await keeper.suspend();
  assert.equal(d.keys.map.size, 0, "G stayed on the disk after the tab was hidden");
  assert.equal(d.tab.map.size, 0, "the tab's keys stayed after the tab was hidden");
  assert.equal(d.clock.pending, 0, "the timer survived the suspend");
  reload(d.deps);
  assert.equal(await take(d.deps), null);
  await keeper.touch();
  assert.equal(keeper.armed, true, "the next input in view did not arm the grace again");
});

test("back from the bfcache the leave mark goes, so a later duplicate inherits none", async () => {
  const d = device();
  const { local, share } = halves();
  await arm(local, share, d.deps);
  leaving(d.deps);
  assert.equal(d.tab.map.get(GO_KEY), "1");
  returning(d.deps);
  assert.equal(d.tab.map.has(GO_KEY), false, "the leave mark survived the return from the bfcache");
  const dup = tabStore();
  for (const [k, v] of d.tab.map) dup.map.set(k, v);
  assert.equal(await take({ ...d.deps, tab: dup }), null, "a duplicate after the bfcache return got the grace");
});
