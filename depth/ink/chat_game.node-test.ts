// The chat's game on screen (GC2): offered, accepted, played on the tables'
// boards. The core is a fake that answers as the node does; the live game is
// depth/core/chat_games.test.ts.
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { render } from "ink-testing-library";
import { ChatGame } from "./chat_game.ts";
import { strings } from "./strings.ts";
import type { ChatGameView } from "../core/chat_games.ts";

const out = (line: string) => (process as unknown as { _rawDebug: (s: string) => void })._rawDebug(line);
const settle = () => new Promise((done) => setTimeout(done, 80));
const say = strings("ru");

type Call = [string, ...unknown[]];
function fake(view: ChatGameView | null) {
  const calls: Call[] = [];
  const ok = (body: unknown = null) => Promise.resolve({ status: 200, body } as never);
  return {
    calls,
    games: {
      view: () => Promise.resolve(view ? { status: 200, body: view } : { status: 404, body: null }) as never,
      propose: (_c: string, k: string, s: string) => (calls.push(["propose", k, s]), ok()),
      answer: (_c: string, a: string) => (calls.push(["answer", a]), ok()),
      move: (_c: string, seq: number, m: unknown) => (calls.push(["move", seq, m]), ok(view)),
      rematch: () => (calls.push(["rematch"]), ok()),
      answerRematch: (_c: string, pid: string, a: string) => (calls.push(["answerRematch", pid, a]), ok()),
      resign: () => (calls.push(["resign"]), ok()),
    },
  };
}
const screen = (f: ReturnType<typeof fake>) =>
  render(h(ChatGame, { say, games: f.games, chatId: "c", name: "Аня", tick: 0, active: true, onClose: () => {}, onError: (m) => out(m) }));

const cases: Array<[string, () => Promise<void>]> = [
  ["no game yet: the classes are offered, and enter proposes the first with its set", async () => {
    const f = fake(null);
    const app = screen(f);
    await settle();
    assert.match(app.lastFrame()!, /игры пока нет/);
    app.stdin.write("\r");
    await settle();
    assert.deepEqual(f.calls, [["propose", "dots", "4x4"]]);
    app.unmount();
  }],
  ["offered by the other side: it says what, and enter accepts", async () => {
    const f = fake({ class: "deck", set: "deck", your_seat: null, board: null, pending: { id: "p", kind: "game", class: "deck", set: "deck", mine: false } });
    const app = screen(f);
    await settle();
    assert.match(app.lastFrame()!, /вам предлагают: deck/);
    app.stdin.write("\r");
    await settle();
    assert.deepEqual(f.calls, [["answer", "accept"]]);
    app.unmount();
  }],
  ["dots on my turn: the board is drawn with the first free edge marked, and enter moves with it", async () => {
    const dots = { n: 2, edges: ["h:0:0"], boxes: {} };
    const f = fake({ class: "dots", set: "2x2", your_seat: 2, pending: null, board: { seq: 4, state: { dots }, turn: 2, score: {}, expires_at: null } });
    const app = screen(f);
    await settle();
    assert.match(app.lastFrame()!, /ваш ход/);
    assert.match(app.lastFrame()!, /·───·═══·/, "the first free edge is not marked");
    app.stdin.write("\r");
    await settle();
    assert.deepEqual(f.calls, [["move", 4, { edge: "h:0:1" }]]);
    app.unmount();
  }],
  ["deck on the table's boards: my hand shows, the other side's only as a count", async () => {
    const deck = { hands: { "1": ["6S", "QH"], "2": { count: 6 } }, stock: { count: 22 }, played: [] };
    const f = fake({ class: "deck", set: "deck", your_seat: 1, pending: null, board: { seq: 1, state: { deck }, turn: 2, score: {}, expires_at: null } });
    const app = screen(f);
    await settle();
    const frame = app.lastFrame()!;
    assert.match(frame, /\[6S\] \[QH\]/, "my own hand is not shown");
    assert.match(frame, /Аня: 6/, "the other side's hand is not shown as a count");
    assert.match(frame, /ходит собеседник: Аня/);
    app.unmount();
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try {
    await fn();
    out(`ok   ${name}`);
  } catch (e) {
    failed++;
    out(`FAIL ${name}\n${(e as Error).message}`);
  }
}
out(`${cases.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
