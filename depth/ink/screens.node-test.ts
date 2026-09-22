// The screens, rendered and typed into. No node is needed for these: what is
// under test is what a person sees and what the arrows do, not the protocol —
// the protocol has its own live tests in depth/core.

// Not node:test: Ink swallows the runner's report (a failing assertion came
// back green, measured 2026-09-22), so the results go out through
// process._rawDebug, which writes past any patched stdout, and the exit code
// is what the shell script reads.
import assert from "node:assert/strict";

const cases: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => cases.push([name, fn]);
const say_ = (line: string) => (process as unknown as { _rawDebug: (s: string) => void })._rawDebug(line);
setTimeout(async () => {
  let failed = 0;
  // A run with nothing in it is not a pass: an empty set used to print
  // "провалено 0" and exit green (operations lens, 2026-09-22).
  if (cases.length < 6) {
    say_(`тестов должно быть не меньше шести, а собрано ${cases.length}`);
    process.exit(1);
  }
  for (const [name, fn] of cases) {
    try {
      await fn();
      say_(`ok   ${name}`);
    } catch (e) {
      failed++;
      say_(`FAIL ${name}\n     ${(e as Error).message.split("\n")[0]}`);
    }
  }
  say_(failed === 0 ? `пройдено ${cases.length}, провалено 0` : `пройдено ${cases.length - failed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}, 0);
import { createElement as h } from "react";
import { render } from "ink-testing-library";
import { Location, Registration } from "./screens.ts";
import { plain } from "./parts.ts";
import { strings } from "./strings.ts";

const say = strings("ru");
const settle = () => new Promise((done) => setTimeout(done, 50));

// A person types slower than React re-renders; without a pause between keys
// the screen would still hold the state the previous key produced, and the
// test would be measuring the test harness, not the screen.
async function type(app: { stdin: { write: (s: string) => void } }, ...keys: string[]) {
  for (const k of keys) {
    app.stdin.write(k);
    await settle();
  }
}
const DOWN = "\u001B[B", UP = "\u001B[A", RIGHT = "\u001B[C", ENTER = "\r", BACK = "\u007F";
void [DOWN, UP, RIGHT, ENTER, BACK];

test("registration will not go on without a name and an age", async () => {
  let got: { name: string; age: number } | null = null;
  const app = render(h(Registration, { say, onDone: (name, age) => (got = { name, age }) }));
  await settle();
  assert.match(app.lastFrame()!, /Operator\./);
  // The action is there but refuses to fire while the fields are empty.
  await type(app, "\r");
  await settle();
  assert.equal(got, null, "an empty registration went through");

  await type(app, "Аня", "\u001B[B", "27");
  assert.match(app.lastFrame()!, /Аня/);
  // Down once more: out of the fields and onto the row of actions.
  await type(app, "\u001B[B", "\r");
  await settle();
  assert.deepEqual(got, { name: "Аня", age: 27 });
  app.unmount();
});

test("an age under eighteen does not open the door", async () => {
  let got: unknown = null;
  const app = render(h(Registration, { say, onDone: (name, age) => (got = { name, age }) }));
  await settle();
  await type(app, "Аня", "\u001B[B", "15", "\u001B[B", "\r");
  await settle();
  assert.equal(got, null, "a fifteen-year-old was registered");
  app.unmount();
});

test("the location refuses a point off the globe and turns the radius with the arrows", async () => {
  let got: { lat: number; lon: number; radius: number } | null = null;
  const app = render(h(Location, { say, onDone: (place) => (got = place) }));
  await settle();
  await type(app, "199", "\u001B[B", "30.33", "\u001B[B", "\u001B[B", "\r");
  await settle();
  assert.equal(got, null, "a latitude of 199 was accepted");
  assert.match(app.lastFrame()!, /-90/, "the screen does not say what is wrong");

  // Back to the latitude, fix it, then step down to the radius and turn it.
  // Up three times: the row of actions, then the radius, then back to the
  // latitude, which is what the cursor has to reach to be fixed.
  await type(app, "\u001B[A", "\u001B[A", "\u001B[A");
  await type(app, "\u007F", "\u007F", "\u007F");
  await type(app, "59.93");
  await type(app, "\u001B[B", "\u001B[B");
  await type(app, "\u001B[C");
  assert.match(app.lastFrame()!, /3000/, "the radius did not turn");
  await type(app, "\u001B[B", "\r");
  assert.deepEqual(got, { lat: 59.93, lon: 30.33, radius: 3000 });
  app.unmount();
});

test("every language renders the first screen without holes", async () => {
  for (const lang of ["en", "ka", "tg", "el"] as const) {
    const app = render(h(Registration, { say: strings(lang), onDone: () => {} }));
    await settle();
    const frame = app.lastFrame()!;
    assert.equal(frame.includes("{"), false, `${lang}: a placeholder was left on the screen`);
    assert.ok(frame.length > 50, `${lang}: the screen came out empty`);
    app.unmount();
  }
});

test("what the node sends cannot repaint the screen", async () => {
  // A name carrying a cursor jump and a colour reset, and an OSC title change:
  // both must come out as text, not as instructions to the terminal.
  const nasty = "Марк\u001B[2J\u001B[H\u001B[31m\u001B]0;узел тут\u0007\u0000";
  const clean = plain(nasty);
  assert.equal(clean.includes("\u001B"), false, `an escape survived: ${JSON.stringify(clean)}`);
  assert.match(clean, /^Марк/, "the name itself was eaten");
  assert.equal(plain("x".repeat(900)).length, 400, "a long line is not cut to a screenful");
  assert.equal(plain(undefined), "", "an absent value must not print as undefined");
});

test("a fresh terminal will not register while the PIN is a placeholder", async () => {
  // The core's escape hatch is what the tests pass; the image must not.
  const { Client } = await import("../core/client.ts");
  const client = new Client("http://127.0.0.1:1", "k");
  await assert.rejects(() => client.register({ name: "Аня", age: 27 }), /placeholders/);
});
