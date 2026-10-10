// The terminal kit (depth/ink/kit.ts), element by element, and the plain face.
// Same harness as screens.node-test.ts: Ink swallows the runner's report, so the
// results go out through process._rawDebug and the exit code is what counts.
//
// KIT_WALK=1 also prints the frames of the plain-mode walkthrough, so the same
// run is the text walkthrough of the terminal (kit_RU.md §5).
import assert from "node:assert/strict";

const cases: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => cases.push([name, fn]);
const say_ = (line: string) => (process as unknown as { _rawDebug: (s: string) => void })._rawDebug(line);
setTimeout(async () => {
  let failed = 0;
  if (cases.length < 9) {
    say_(`тестов должно быть не меньше девяти, а собрано ${cases.length}`);
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

import { createElement as h, useState } from "react";
import { render } from "ink-testing-library";
import { Actions, Board, Card, Check, Empty, ErrorLine, Fields, Head, Line, Link, Notice, Panel, Segments, Select } from "./kit.ts";
import { Location, Registration } from "./screens.ts";
import { Hidden, Statements } from "./rooms.ts";
import { strings } from "./strings.ts";

const say = strings("ru");
const settle = (ms = 50) => new Promise((done) => setTimeout(done, ms));
async function type(app: { stdin: { write: (s: string) => void } }, ...keys: string[]) {
  for (const k of keys) {
    app.stdin.write(k);
    await settle();
  }
}
const DOWN = "\u001B[B", RIGHT = "\u001B[C", LEFT = "\u001B[D", ENTER = "\r";
const FRAME_GLYPHS = /[─│┌┐└┘├┤┬┴┼╭╮╰╯▋]/;

// Plain mode is read when drawn, so a test can flip it and flip it back.
async function withPlain<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const before = process.env.DEPTH_PLAIN;
  if (value === undefined) delete process.env.DEPTH_PLAIN;
  else process.env.DEPTH_PLAIN = value;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.DEPTH_PLAIN;
    else process.env.DEPTH_PLAIN = before;
  }
}

test("Select shows ‹ value › and left/right turn it", async () => {
  const seen: string[] = [];
  function Host() {
    const [v, setV] = useState("один");
    return h(Select, { label: "режим", value: v, choices: ["один", "вдвоём", "компанией"], onChange: (x: string) => (seen.push(x), setV(x)) });
  }
  const app = render(h(Host));
  await settle();
  assert.match(app.lastFrame()!, /режим: ‹ один ›/);
  await type(app, RIGHT, RIGHT, LEFT);
  assert.deepEqual(seen, ["вдвоём", "компанией", "вдвоём"]);
  assert.match(app.lastFrame()!, /‹ вдвоём ›/);
  app.unmount();
});

test("Segments draws ( ) and (•), left/right move the choice and stop at the ends", async () => {
  function Host() {
    const [v, setV] = useState("one");
    return h(Segments, { options: [{ key: "one", label: "один" }, { key: "group", label: "компанией" }], value: v, onChange: setV });
  }
  const app = render(h(Host));
  await settle();
  assert.match(app.lastFrame()!, /\(•\) один {2}\( \) компанией/);
  await type(app, RIGHT, RIGHT);
  assert.match(app.lastFrame()!, /\( \) один {2}\(•\) компанией/);
  await type(app, LEFT, LEFT, LEFT);
  assert.match(app.lastFrame()!, /\(•\) один/);
  app.unmount();
});

test("Check shows [x] / [ ] and space flips it, nothing else does", async () => {
  function Host() {
    const [on, setOn] = useState(false);
    return h(Check, { label: "согласен", checked: on, onChange: setOn });
  }
  const app = render(h(Host));
  await settle();
  assert.match(app.lastFrame()!, /\[ \] согласен/);
  await type(app, "a", ENTER);
  assert.match(app.lastFrame()!, /\[ \] согласен/, "a key that is not space flipped the box");
  await type(app, " ");
  assert.match(app.lastFrame()!, /\[x\] согласен/);
  await type(app, " ");
  assert.match(app.lastFrame()!, /\[ \] согласен/);
  app.unmount();
});

test("Link shows ‹text›, the address on the next line, and enter opens it", async () => {
  const opened: string[] = [];
  const app = render(h(Link, { text: "правила", href: "https://xor.ad/rules", onOpen: (u: string) => opened.push(u) }));
  await settle();
  const lines = app.lastFrame()!.split("\n");
  assert.match(lines[0], /‹правила›/);
  assert.match(lines[1], /https:\/\/xor\.ad\/rules/, "the address is not on the line after the link");
  await type(app, ENTER);
  assert.deepEqual(opened, ["https://xor.ad/rules"]);
  app.unmount();
});

test("Card is a block of three lines, and the one in focus is marked by > and nothing else", async () => {
  const on = render(h(Card, { title: "Аня, 34", meta: "300 м · 5 мин", body: "гуляю у реки", on: true }));
  const off = render(h(Card, { title: "Аня, 34", meta: "300 м · 5 мин", body: "гуляю у реки" }));
  await settle();
  const lines = on.lastFrame()!.split("\n");
  assert.equal(lines.length, 3, `a card is three lines, got ${lines.length}`);
  assert.match(lines[0], /^> Аня, 34$/);
  assert.match(lines[1], /300 м/);
  assert.match(lines[2], /гуляю у реки/);
  assert.match(off.lastFrame()!, /^ {2}Аня, 34$/m, "a card out of focus kept the mark");
  on.unmount();
  off.unmount();
});

test("Line is the name and the time, then the text", async () => {
  const app = render(h(Line, { name: "Аня", time: "12:40", text: "привет" }));
  await settle();
  const lines = app.lastFrame()!.split("\n");
  assert.match(lines[0], /^Аня {2}12:40$/);
  assert.equal(lines[1], "привет");
  app.unmount();
});

test("the word comes first: «ошибка:», «внимание:», and never a bare «!»", async () => {
  const e =render(h(ErrorLine, { say }, "узел не отвечает"));
  const n = render(h(Notice, { say }, "код живёт десять минут"));
  const m = render(h(Empty, { title: "ничего нет", hint: "напишите первым" }));
  await settle();
  assert.match(e.lastFrame()!, /^ошибка: узел не отвечает$/);
  assert.match(n.lastFrame()!, /^внимание: код живёт десять минут$/);
  assert.equal(m.lastFrame()!.split("\n")[0], "ничего нет", "Empty does not start with its title");
  for (const f of [e, n, m]) assert.doesNotMatch(f.lastFrame()!, /^\s*!/m, "a line starts with !");
  // The word is the screen's language, not the code's.
  const en = render(h(ErrorLine, { say: strings("en") }, "the node does not answer"));
  await settle();
  assert.match(en.lastFrame()!, /^error: the node/);
  for (const a of [e, n, m, en]) a.unmount();
});

test("Board draws the grid, marks the cursor's row with > and its cell by inverse", async () => {
  const app = render(h(Board, { rows: [["1", "·", "●"], ["2", "○", "·"]], at: { row: 1, col: 1 } }));
  const plainRows = render(h(Board, { rows: ["  ·—·", "  | |"] }));
  await settle();
  const lines = app.lastFrame()!.split("\n");
  assert.match(lines[0], /^ {2}1 · ●$/);
  assert.match(lines[1], /^> 2 ○ ·$/);
  assert.equal(plainRows.lastFrame()!, "  ·—·\n  | |", "a laid-out row was changed");
  app.unmount();
  plainRows.unmount();
});

test("focus is > in front, on actions and on fields alike", async () => {
  const actions = render(h(Actions, { actions: [{ key: "a", label: "да" }, { key: "b", label: "нет" }], onPick: () => {} }));
  const idle = render(h(Actions, { actions: [{ key: "a", label: "да" }], onPick: () => {}, active: false }));
  const fields = render(h(Fields, {
    fields: [{ key: "a", label: "имя", value: "Аня" }, { key: "b", label: "возраст", value: "27" }],
    onChange: () => {},
  }));
  await settle();
  assert.match(actions.lastFrame()!, /^> \[ да \]\s+нет/, "the chosen action is not marked");
  assert.doesNotMatch(idle.lastFrame()!, /> \[/, "an action row that does not hear the arrows was marked");
  const lines = fields.lastFrame()!.split("\n");
  assert.match(lines[0], /^> имя: {5}Аня/);
  assert.match(lines[1], /^ {2}возраст: 27/);
  await type(fields, DOWN);
  const moved = fields.lastFrame()!.split("\n");
  assert.match(moved[1], /^> возраст:/, "the mark did not follow the arrow");
  for (const a of [actions, idle, fields]) a.unmount();
});

test("DEPTH_PLAIN=1: no frame glyphs, no ▋; the rich face has them", async () => {
  const draw = () =>
    render(h(Panel, null, h(Head, { title: "заголовок" }), h(Fields, {
      fields: [{ key: "a", label: "имя", value: "Аня" }],
      onChange: () => {},
    })));
  const rich = await withPlain(undefined, async () => {
    const app = draw();
    await settle();
    const frame = app.lastFrame()!;
    app.unmount();
    return frame;
  });
  assert.match(rich, /─/, "the rich face lost its rule");
  assert.match(rich, /│/, "the rich face lost its frame");
  assert.match(rich, /▋/, "the rich face lost its cursor block");
  const flat = await withPlain("1", async () => {
    const app = draw();
    await settle();
    const frame = app.lastFrame()!;
    app.unmount();
    return frame;
  });
  assert.doesNotMatch(flat, FRAME_GLYPHS, `plain still draws a frame glyph:\n${flat}`);
  assert.match(flat, /^ *> имя: Аня_$/m, "plain lost the focus mark or the text caret");
  assert.equal(
    await withPlain("0", async () => {
      const app = draw();
      await settle();
      const frame = app.lastFrame()!;
      app.unmount();
      return /▋/.test(frame);
    }),
    true,
    "only DEPTH_PLAIN=1 turns the plain face on",
  );
});

test("DEPTH_PLAIN=1 walkthrough: registration, a list, a framed statement — as text", async () => {
  const walk = process.env.KIT_WALK === "1";
  const frames: string[] = [];
  await withPlain("1", async () => {
    const reg = render(h(Registration, { say, onDone: () => {} }));
    await settle();
    frames.push(`── регистрация`, reg.lastFrame()!);
    await type(reg, "Аня", DOWN, "27");
    frames.push(`── регистрация, заполнена`, reg.lastFrame()!);
    await type(reg, DOWN, DOWN, DOWN);
    reg.unmount();

    const bad = render(h(Location, { say, onDone: () => {} }));
    await settle();
    await type(bad, "199", DOWN, "30.33", DOWN, DOWN, ENTER);
    await settle();
    frames.push(`── точка, широта 199`, bad.lastFrame()!);
    bad.unmount();

    const rows = [{ id: "h1", kind: "feed", text: "гуляю у реки" }, { id: "h2", kind: "feed", text: "кофе с утра" }];
    const hidden = render(h(Hidden, {
      say,
      // deno-lint-ignore no-explicit-any
      client: { hidden: () => Promise.resolve(rows), unhide: () => Promise.resolve({ status: 204, body: {} }) } as any,
      onBack: () => {},
      onError: () => {},
    }));
    await settle(200);
    await type(hidden, DOWN);
    frames.push(`── скрытые, второе в фокусе`, hidden.lastFrame()!);
    hidden.unmount();

    const decided = {
      id: "s1", restriction: "hidden" as const, facts: "решение по уведомлению",
      ground_kind: "legal" as const, ground_text: "ст. 5 закона о рекламе", automated_used: false,
      created_at: Date.UTC(2026, 7, 24) / 1000,
    };
    const st = render(h(Statements, { say, lang: "ru", items: [decided], onDone: () => {} }));
    await settle();
    frames.push(`── заявление об ограничении (в цвете это рамка)`, st.lastFrame()!);
    st.unmount();
  });
  for (let i = 0; i < frames.length; i += 2) {
    const [title, frame] = [frames[i], frames[i + 1]];
    assert.doesNotMatch(frame, FRAME_GLYPHS, `${title}: a frame glyph in plain mode`);
    assert.doesNotMatch(frame, /^\s*!/m, `${title}: a line starts with !`);
    assert.doesNotMatch(frame, /\u001B\[\?1049/, `${title}: the alternate buffer`);
  }
  assert.match(frames[1], /^> имя: *_?$/m, "the first field is not marked in the plain registration");
  assert.match(frames[7], /^> кофе с утра$/m, "the second hidden phrase is not marked");
  assert.match(frames[5], /^ошибка:|ошибка:/m, "the refusal is not said with the word «ошибка:»");
  if (walk) for (let i = 0; i < frames.length; i += 2) say_(`${frames[i]}\n${frames[i + 1]}\n`);
});
