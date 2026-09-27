// The table screen (§4.9; G2), rendered and typed into, without a node.
// Not node:test, for the reason screens.node-test.ts gives: Ink swallows its
// report, so the results go out through process._rawDebug and the exit code.
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { render } from "ink-testing-library";
import { NewTable, Table, type TableAction, TableRoom } from "./table.ts";
import { strings } from "./strings.ts";
import type { TableView } from "../core/tables.ts";

const out = (line: string) => (process as unknown as { _rawDebug: (s: string) => void })._rawDebug(line);
const settle = () => new Promise((done) => setTimeout(done, 50));
const say = strings("ru");
const NOW = 1_000_000_000;

const view = (over: Partial<TableView> = {}): TableView => ({
  id: "t", class: "dots", set: "3x3", seat: 2, is_playing: true, playing: 2, watching: 1, like_count: 2,
  name: "точки после работы",
  seats: [{ seat: 1, name: "Аня", role: "playing" }, { seat: 2, name: "Женя", role: "playing" }, { seat: 3, name: "Костя", role: "watching" }],
  board: { seq: 3, state: { moves: [{ seat: 1, move: { edge: [0, 1] } }] }, turn: 2, score: { "1": 1, "2": 0 }, expires_at: NOW + 45 },
  lines: [
    { id: "l1", seat: 1, kind: "line", text: "чур я первая", created_at: 1 },
    { id: "l2", seat: 3, kind: "application", text: "можно к вам?", created_at: 2 },
  ],
  ...over,
});

const cases: Array<[string, () => Promise<void>]> = [
  ["the table says it is open, whose turn and how long, the score and who asks to sit", async () => {
    const app = render(h(Table, { say, view: view(), onPick: () => {}, now: NOW * 1000 }));
    await settle();
    const frame = app.lastFrame()!;
    assert.match(frame, /без сквозного шифрования/, "the screen does not say the table is open to the node");
    assert.match(frame, /ваш ход · 45 с/, "my turn and its clock are not shown");
    assert.match(frame, /счёт: Аня 1 · Женя 0/);
    assert.match(frame, /♥ 2/);
    assert.match(frame, /заявка: Костя/, "a waiting application is not shown");
    app.unmount();
  }],
  ["on another's turn the pass does not fire, and a finished game says so", async () => {
    let picked: TableAction | null = null;
    const theirs = view({ board: { seq: 3, state: {}, turn: 1, score: {}, expires_at: NOW + 10 } });
    const app = render(h(Table, { say, view: theirs, onPick: (a) => (picked = a), now: NOW * 1000 }));
    await settle();
    assert.match(app.lastFrame()!, /ход: Аня · 10 с/);
    app.stdin.write("\r");
    await settle();
    assert.equal(picked, null, "a pass went out on another's turn");
    app.unmount();
    const over = render(h(Table, { say, view: view({ board: null }), onPick: () => {} }));
    await settle();
    assert.match(over.lastFrame()!, /партия окончена/);
    over.unmount();
  }],
  ["on my turn enter passes", async () => {
    let picked: TableAction | null = null;
    const app = render(h(Table, { say, view: view(), onPick: (a) => (picked = a), now: NOW * 1000 }));
    await settle();
    app.stdin.write("\r");
    await settle();
    assert.equal(picked, "pass");
    app.unmount();
  }],
  ["dots: the board is drawn, ] marks the next free edge, and enter moves with it", async () => {
    let moved: unknown = null;
    const dots = { n: 2, edges: ["h:0:0"], boxes: {} };
    const v = view({ board: { seq: 3, state: { dots }, turn: 2, score: {}, expires_at: NOW + 45 } });
    const app = render(h(Table, { say, view: v, onPick: () => {}, onMove: (m) => (moved = m), now: NOW * 1000 }));
    await settle();
    assert.match(app.lastFrame()!, /·───·═══·/, "the first free edge is not marked on the board");
    app.stdin.write("]");
    await settle();
    assert.match(app.lastFrame()!, /ход h:1:0/, "] did not step to the next free edge");
    app.stdin.write("\r");
    await settle();
    assert.deepEqual(moved, { edge: "h:1:0" });
    app.unmount();
  }],
  ["live: a line frame shows at once, a seat frame reads the table again, 4005 leaves it", async () => {
    let reads = 0;
    let left = 0;
    let closeWith: (code: number) => void = () => {};
    const frames: Array<(f: unknown) => void> = [];
    const queued: unknown[] = [];
    const room = {
      closed: new Promise<number>((r) => (closeWith = r)),
      next: () => queued.length ? Promise.resolve(queued.shift()) : new Promise((r) => frames.push(r)),
      close: () => {},
    };
    const push = (f: unknown) => (frames.length ? frames.shift()!(f) : queued.push(f));
    const tables = {
      view: () => { reads++; return Promise.resolve({ status: 200, body: view({ playing: reads === 1 ? 2 : 3 }) }); },
    };
    const app = render(h(TableRoom, {
      say, tables: tables as never, open: () => Promise.resolve(room as never), tableId: "t",
      onLeave: () => left++, onError: (m: string) => { throw new Error(m); },
    }));
    await settle();
    assert.equal(reads, 1, "the table was not read once on entry");
    push({ type: "line", seq: 1, data: { id: "l9", seat: 1, kind: "line", text: "ваш ход, Женя", created_at: 9 } });
    await settle();
    assert.match(app.lastFrame()!, /ваш ход, Женя/, "a line frame did not show");
    assert.equal(reads, 1, "a line frame read the table again");
    push({ type: "seat", seq: 2, data: { playing: 3, watching: 1 } });
    await settle();
    assert.equal(reads, 2, "a seat frame did not read the table again");
    assert.match(app.lastFrame()!, /играют 3/);
    closeWith(4005);
    await settle();
    assert.equal(left, 1, "4005 did not leave the table");
    app.unmount();
  }],
  ["setting a table sends the class, set, seats, point and name, and opens the table it got", async () => {
    const sent: unknown[] = [];
    let opened: string | null = null;
    const tables = { create: (t: unknown) => { sent.push(t); return Promise.resolve({ status: 201, body: { id: "t7" } }); } };
    const app = render(h(NewTable, {
      say, tables: tables as never, place: { lat: 52.5, lon: 13.4, radius: 1000 }, onSet: (id: string) => (opened = id), onBack: () => {},
    }));
    await settle();
    assert.match(app.lastFrame()!, /поставить стол/);
    // Down to "seats", right once: 3; down to the name, type; down into the row, enter.
    for (const k of ["\u001B[B", "\u001B[B", "\u001B[C", "\u001B[B", "домино", "\u001B[B", "\r"]) {
      app.stdin.write(k);
      await settle();
    }
    assert.deepEqual(sent, [{ class: "dots", set: "4x4", seats: 3, lat: 52.5, lon: 13.4, area_radius: 1000, name: "домино" }]);
    assert.equal(opened, "t7", "the table set was not opened");
    app.unmount();
  }],
];

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
  out(failed === 0 ? `стол: пройдено ${cases.length}, провалено 0` : `стол: пройдено ${cases.length - failed}, провалено ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}, 0);
