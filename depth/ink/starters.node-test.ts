// The conversation's starters on the chat screen (chat spec "Liked, in order",
// §8.7; N3): the block at the top, numbered from the inbox row, and an extra
// like arriving in the room as a centred card whose number joins the block.
// The core is a fake that answers as the node does (routes/inbox.ts, the room's
// extra_like frame); the reading itself is depth/core/chat_starters.test.ts.
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { render } from "ink-testing-library";
import { Chat } from "./rooms.ts";
import { strings } from "./strings.ts";

const out = (line: string) => (process as unknown as { _rawDebug: (s: string) => void })._rawDebug(line);
const settle = (ms = 150) => new Promise((done) => setTimeout(done, ms));
const say = strings("ru");

type Frame = { type: string; seq: number; data: unknown };
function fake(starters: unknown[]) {
  const frames: Frame[] = [];
  let wake: () => void = () => {};
  const client = {
    inbox: () => Promise.resolve([
      { kind: "chat", id: "other", starters: [{ position: 1, text: "чужая беседа", mode: "alone", liked_by: "me", removed: false }] },
      { kind: "chat", id: "c1", starters },
    ]),
    openConversation: () => Promise.resolve({ safetyCode: "0000 0000 0000 0000 0000" }),
    openRoom: () => Promise.resolve({
      next: () => frames.length > 0 ? Promise.resolve(frames.shift()!) : new Promise((r) => (wake = () => r(frames.shift()!))),
      close: () => {},
      closed: new Promise(() => {}),
    }),
    read: () => Promise.resolve("строка"),
  };
  const push = (f: Frame) => { frames.push(f); wake(); };
  return { client, push };
}
const screen = (f: ReturnType<typeof fake>) =>
  render(h(Chat, {
    say,
    // deno-lint-ignore no-explicit-any
    client: f.client as any,
    chatId: "c1", name: "Аня", age: 34, limit: 256, span: 60, endsAt: Math.floor(Date.now() / 1000) + 3000,
    onBack: () => {}, onError: (m: string) => out(`  onError: ${m}`),
  }));
const at = (frame: string, text: string) => {
  const i = frame.indexOf(text);
  assert.ok(i >= 0, `not on the screen: «${text}»\n${frame}`);
  return i;
};

const cases: Array<[string, () => Promise<void>]> = [
  ["the starters stand under «Liked, in order» by their number, whatever order the row gives, each marked", async () => {
    const f = fake([
      { position: 2, text: "кто на набережную?", mode: "alone", liked_by: "them", removed: false },
      { position: 1, text: "гуляю у залива", mode: "company", liked_by: "me", removed: false },
    ]);
    const app = screen(f);
    await settle();
    const frame = app.lastFrame()!;
    const head = at(frame, "Понравилось, по порядку");
    const first = at(frame, "1. Вам понравилось: «гуляю у залива»");
    const second = at(frame, "2. Собеседнику понравилось: «кто на набережную?»");
    assert.ok(head < first && first < second, `the starters are not in the order of their number:\n${frame}`);
    assert.doesNotMatch(frame, /чужая беседа/, "a starter of another conversation came onto this screen");
    app.unmount();
  }],
  ["a starter taken down under Article 16 keeps its number and says so, with no text", async () => {
    const f = fake([
      { position: 1, text: "", mode: "alone", liked_by: "them", removed: true },
      { position: 2, text: "вторая", mode: "alone", liked_by: "me", removed: false },
    ]);
    const app = screen(f);
    await settle();
    const frame = app.lastFrame()!;
    at(frame, "1. Собеседнику понравилось: фраза снята");
    at(frame, "2. Вам понравилось: «вторая»");
    assert.doesNotMatch(frame, /«»/, "an empty quote stands where the phrase was taken down");
    app.unmount();
  }],
  ["an extra like comes as a centred card with the next number, and the number joins the block", async () => {
    const f = fake([{ position: 1, text: "гуляю у залива", mode: "company", liked_by: "me", removed: false }]);
    const app = screen(f);
    await settle();
    assert.doesNotMatch(app.lastFrame()!, /^\s*2\./m);
    f.push({ type: "extra_like", seq: 2, data: { kind: "extra_like", position: 2, text: "и ещё одна", mode: "alone", direction: "they_liked_yours" } });
    await settle();
    let frame = app.lastFrame()!;
    at(frame, "2. Собеседнику понравилось: «и ещё одна»");
    at(frame, "2. вашему собеседнику понравилось ещё одно ваше сообщение");
    assert.match(frame, /[┌╭]/, "the extra like is not drawn as a card");
    f.push({ type: "extra_like", seq: 3, data: { kind: "extra_like", position: 3, text: "и моя", mode: "alone", direction: "you_liked_theirs" } });
    await settle();
    frame = app.lastFrame()!;
    at(frame, "3. Вам понравилось: «и моя»");
    at(frame, "3. вам понравилось ещё одно сообщение собеседника");
    app.unmount();
  }],
  ["the same extra like twice (a reopened room hands it again) is one card and one row", async () => {
    const f = fake([{ position: 1, text: "гуляю у залива", mode: "company", liked_by: "me", removed: false }]);
    const app = screen(f);
    await settle();
    const extra = { type: "extra_like", seq: 2, data: { kind: "extra_like", position: 2, text: "и ещё одна", mode: "alone", direction: "they_liked_yours" } };
    f.push(extra);
    await settle();
    f.push({ ...extra, seq: 3 });
    await settle();
    const frame = app.lastFrame()!;
    assert.equal(frame.split("«и ещё одна»").length - 1, 2, `a repeated extra like drew twice:\n${frame}`);
    app.unmount();
  }],
];

// Not node:test: Ink swallows its report (screens.node-test.ts, 2026-09-22).
setTimeout(async () => {
  let failed = 0;
  for (const [name, fn] of cases) {
    try {
      await fn();
      out(`ok   ${name}`);
    } catch (e) {
      failed++;
      out(`FAIL ${name}\n     ${(e as Error).message.split("\n")[0]}`);
    }
  }
  out(failed === 0 ? `пройдено ${cases.length}, провалено 0` : `пройдено ${cases.length - failed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}, 0);
