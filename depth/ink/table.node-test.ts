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
  ["a table's seats follow its class, and its name is cut by graphemes, not by halves of an emoji", async () => {
    const sent: Array<{ seats: number; name?: string }> = [];
    const tables = { create: (t: { seats: number; name?: string }) => { sent.push(t); return Promise.resolve({ status: 201, body: { id: "t" } }); } };
    const app = render(h(NewTable, { say, tables: tables as never, place: { lat: 1, lon: 1, radius: 1000 }, onSet: () => {}, onBack: () => {} }));
    await settle();
    // dots: seats are 2 only — right on «мест» stays at 2.
    for (const k of ["\u001B[B", "\u001B[B", "\u001B[C", "\u001B[C", "\u001B[B", "а".repeat(23) + "👍👍", "\u001B[B", "\r"]) {
      app.stdin.write(k);
      await settle();
    }
    assert.equal(sent[0]?.seats, 2, "a dots table was offered more than two seats");
    assert.equal(sent[0]?.name, "а".repeat(23) + "👍", "the name was not cut at 24 whole graphemes");
    app.unmount();
  }],
  ["another's rematch is accepted from the row, one's own is not answered", async () => {
    const calls: string[] = [];
    const room = { closed: new Promise<number>(() => {}), next: () => new Promise(() => {}), close: () => {} };
    const withPending = (by: number) => view({ board: { seq: 0, state: {}, turn: null, score: {}, expires_at: null, pending: { kind: "rematch", id: "p1", by } } });
    for (const by of [1, 2]) {
      const tables = {
        view: () => Promise.resolve({ status: 200, body: withPending(by) }),
        answer: (_t: string, pid: string, a: string) => { calls.push(`answer ${pid} ${a}`); return Promise.resolve({ status: 200, body: {} }); },
        propose: () => { calls.push("propose"); return Promise.resolve({ status: 201, body: {} }); },
      };
      const app = render(h(TableRoom, { say, tables: tables as never, open: () => Promise.resolve(room as never), tableId: "t", onLeave: () => {}, onError: () => {} }));
      await settle();
      // The row: пас, сказать, партия… — right twice onto the rematch.
      for (const k of ["\u001B[C", "\u001B[C", "\r"]) { app.stdin.write(k); await settle(); }
      app.unmount();
    }
    assert.deepEqual(calls, ["answer p1 accept"], "another's rematch was not accepted, or one's own was answered");
  }],
  ["once the turn passes, the arrows come back from the board to the table's row", async () => {
    const picked: string[] = [];
    const deck = (turn: number) => view({
      class: "deck" as never,
      board: { seq: 2, turn, score: {}, expires_at: NOW + 30, state: { deck: { hands: { "1": { count: 5 }, "2": ["7♠"] }, stock: { count: 20 }, played: ["9♣"] } } },
    });
    const props = { say, onPick: (a: string) => picked.push(a), onMove: () => {}, now: NOW * 1000 };
    const app = render(h(Table, { ...props, view: deck(2) }));
    await settle();
    app.stdin.write("\t");
    await settle();
    app.rerender(h(Table, { ...props, view: deck(1) }));
    await settle();
    for (const k of ["\u001B[C", "\r"]) { app.stdin.write(k); await settle(); }
    assert.deepEqual(picked, ["say"], "after the turn passed the row stayed deaf and «встать» could not be reached");
    // The turn comes back: the row still holds the arrows, a card is not played.
    const moved: unknown[] = [];
    app.rerender(h(Table, { ...props, onMove: (m: unknown) => moved.push(m), view: deck(2) }));
    await settle();
    app.stdin.write("\r");
    await settle();
    assert.deepEqual(moved, [], "the focus jumped back to the board and a key meant for the row played a card");
    app.unmount();
  }],
  ["grid: tab out of the board and back keeps the field in hand", async () => {
    const moves: unknown[] = [];
    const grid = view({
      class: "grid" as never,
      board: { seq: 1, turn: 2, score: {}, expires_at: NOW + 30, state: { grid: { cells: { c3: { seat: 2, piece: "M" } }, claim: null } } },
    });
    const app = render(h(Table, { say, view: grid, onPick: () => {}, onMove: (m: unknown) => moves.push(m), now: NOW * 1000 }));
    await settle();
    for (const k of ["\t", "c", "\t", "\t", "3", "\u001B[B", "d4", "\u001B[B", "\r"]) { app.stdin.write(k); await settle(); }
    assert.deepEqual(moves, [{ from: "c3", to: "d4" }], "tab moved the grid's field, and the move went out wrong");
    app.unmount();
  }],
  ["«сказать» opens a line, sends it to the node and leaves the keys alive", async () => {
    const sent: unknown[] = [];
    const room = { closed: new Promise<number>(() => {}), next: () => new Promise(() => {}), close: () => {} };
    const tables = {
      view: () => Promise.resolve({ status: 200, body: view() }),
      say: (_t: string, line: unknown) => { sent.push(line); return Promise.resolve({ status: 202, body: {} }); },
    };
    const app = render(h(TableRoom, {
      say, tables: tables as never, open: () => Promise.resolve(room as never), tableId: "t", onLeave: () => {},
      onError: (m: string) => { throw new Error(m); },
    }));
    await settle();
    // The row: пас (greyed), сказать — right once, enter.
    for (const k of ["\u001B[C", "\r", "добрый вечер", "\u001B[B", "\r"]) { app.stdin.write(k); await settle(); }
    assert.deepEqual(sent, [{ kind: "line", text: "добрый вечер" }], "the line was not sent");
    assert.match(app.lastFrame()!, /ещё партию/, "the table did not come back after the line was sent");
    app.unmount();
  }],
  ["a neighbour's escape codes in the table's name, a seat's name or a line do not reach the terminal", async () => {
    const hostile = view({
      name: "\u001B[2Jдомино",
      seats: [{ seat: 1, name: "\u001B[31mАня‮", role: "playing" }, { seat: 2, name: "Женя", role: "playing" }],
      lines: [
        { id: "l1", seat: 1, kind: "line", text: "привет\u001B]0;pwned\u0007\u001B[2J", created_at: 1 },
        { id: "l2", seat: 1, kind: "line", text: "при\u202Eвет мир", created_at: 2 },
      ],
      playing: "\u001B]0;x\u0007" as never,
      like_count: "\u202Eevil" as never,
    });
    const app = render(h(Table, { say, view: hostile, onPick: () => {}, now: NOW * 1000 }));
    await settle();
    const frame = app.lastFrame()!;
    assert.doesNotMatch(frame, /\u001B\[2J|\u001B\[31m|\u001B\]0;|‮/, "a neighbour's control codes reached the screen");
    assert.match(frame, /домино/);
    assert.match(frame, /привет/);
    app.unmount();
  }],
  ["deck: one's own hand as cards, the others' as a number; tab to the board, a card played on one's turn only", async () => {
    const moves: unknown[] = [];
    const deckView = (turn: number) => view({
      class: "deck" as never,
      board: {
        seq: 2, turn, score: {}, expires_at: NOW + 30,
        state: { deck: { hands: { "1": { count: 5 }, "2": ["7♠", "Q♥"] }, stock: { count: 20 }, played: ["9♣"] } },
      },
    });
    const app = render(h(Table, { say, view: deckView(2), onPick: () => {}, onMove: (m: unknown) => moves.push(m), now: NOW * 1000 }));
    await settle();
    const frame = app.lastFrame()!;
    assert.match(frame, /на столе: 9♣/);
    assert.match(frame, /\[7♠\] \[Q♥\]/, "one's own hand is not shown as cards");
    assert.match(frame, /Аня: 5/, "the other's hand is not shown as a number");
    for (const k of ["\t", "\u001B[C", "\r"]) { app.stdin.write(k); await settle(); }
    assert.deepEqual(moves, [{ play: "Q♥" }], "the card picked was not played");
    app.unmount();
    const theirs = render(h(Table, { say, view: deckView(1), onPick: () => {}, onMove: (m: unknown) => moves.push(m), now: NOW * 1000 }));
    await settle();
    for (const k of ["\t", "\r"]) { theirs.stdin.write(k); await settle(); }
    assert.equal(moves.length, 1, "a card went out on another's turn");
    theirs.unmount();
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
    // Down to "seats", right once: still 2, dots seat two (the node refuses more); down to the name, type; down into the row, enter.
    for (const k of ["\u001B[B", "\u001B[B", "\u001B[C", "\u001B[B", "домино", "\u001B[B", "\r"]) {
      app.stdin.write(k);
      await settle();
    }
    assert.deepEqual(sent, [{ class: "dots", set: "4x4", seats: 2, lat: 52.5, lon: 13.4, area_radius: 1000, name: "домино" }]);
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
