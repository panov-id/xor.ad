// The lock: the timer that fires on five idle minutes, the vault key that
// seals what the process can write down, and the core locked and opened again
// against a live node — scripts/run-depth-tests.sh starts one.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { IdleTimer, decodeSealable, encodeSealable, open, seal, vaultKey } from "./lock.ts";
import { Client } from "./client.ts";
import { newPaperCode } from "./paper.ts";
import { HeldKey } from "./transfer.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");

// A clock the test turns by hand: nobody sits through five minutes here.
function fakeClock() {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout: (fn: () => void, ms: number) => {
      const id = next++;
      due.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h: unknown) => void due.delete(h as number),
    advance(ms: number) {
      now += ms;
      for (const [id, { at, fn }] of [...due]) {
        if (at <= now) {
          due.delete(id);
          fn();
        }
      }
    },
  };
}

Deno.test("the timer fires once after the idle span, and a key starts the span over", () => {
  const clock = fakeClock();
  let fired = 0;
  const timer = new IdleTimer(() => fired++, 300_000, clock);
  clock.advance(299_999);
  assertEquals(fired, 0, "fired before five minutes were up");
  timer.touch();
  clock.advance(299_999);
  assertEquals(fired, 0, "a key did not start the five minutes over");
  clock.advance(1);
  assertEquals(fired, 1, "five idle minutes did not lock");
  clock.advance(600_000);
  assertEquals(fired, 1, "fired again without a key in between");
  timer.touch();
  timer.stop();
  clock.advance(600_000);
  assertEquals(fired, 1, "a stopped timer fired");
});

Deno.test("the seal opens under the same halves and under no others", async () => {
  const local = crypto.getRandomValues(new Uint8Array(32));
  const share = crypto.getRandomValues(new Uint8Array(32));
  const key = await vaultKey(local, share);
  const doc = { longPkcs8: "AAEC", wrappedLongKey: "_-8" };
  const sealed = await seal(key, encodeSealable(doc));
  assertEquals(decodeSealable(await open(await vaultKey(local, share), sealed)), doc);
  const otherShare = crypto.getRandomValues(new Uint8Array(32));
  await assertRejects(async () => open(await vaultKey(local, otherShare), sealed), Error);
  const otherLocal = crypto.getRandomValues(new Uint8Array(32));
  await assertRejects(async () => open(await vaultKey(otherLocal, share), sealed), Error);
  await assertRejects(() => vaultKey(new Uint8Array(), share), Error, "both halves");
});

Deno.test({
  name: "a locked core signs nothing but the proof, a wrong PIN costs an attempt, the right one opens it",
  ignore: !node,
  async fn() {
    const client = new Client(node!, apiKey!);
    await client.register({ name: "Женя", age: 30 }, { pin: "123456", paperCode: newPaperCode() }, { hold: HeldKey.hold });
    await client.confirmPaperCode();
    assert(client.held, "the long key was not held after registration");

    const locked = await client.lock();
    assertEquals(locked, { sealed: true }, "a PIN set on this device seals under its halves");
    assert(client.locked);
    assertEquals(client.held, null, "the held long key stayed in memory under the lock");
    await assertRejects(() => client.profile(), Error, "locked");

    const wrong = await client.unlock("000000", { hold: HeldKey.hold });
    assert(!wrong.ok, "a wrong PIN opened the lock");
    if (!wrong.ok) {
      assertEquals(wrong.answer.status, 409);
      assertEquals(wrong.answer.body.error?.code, "pin_mismatch");
      assertEquals(wrong.answer.body.error?.attempts_left, 9, "the node did not count the attempt");
    }
    assert(client.locked, "a refused proof unlocked the core");

    const right = await client.unlock("123456", { hold: HeldKey.hold });
    assert(right.ok, "the right PIN did not open the lock");
    assert(!client.locked);
    assert(client.held, "the long key did not come back from the seal");
    const me = await client.profile();
    assertEquals(me.name, "Женя");

    // Locked twice in a row: the halves the unlock brought back seal again,
    // and the seal of the second lock opens as the first did.
    assertEquals(await client.lock(), { sealed: true });
    assert((await client.unlock("123456", { hold: HeldKey.hold })).ok);
    assert(client.held);
  },
});
