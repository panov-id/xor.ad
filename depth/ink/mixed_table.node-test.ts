// W10-MX · a mixed table: Борис sets a dots table from the terminal's feed at
// the page's point, Аня (web/e2e/specs/mixed-table.spec.ts) sits at it from
// her feed and applies, he starts the game, and each makes a move the other
// sees — the terminal's edge on the page's board, the page's in the
// terminal's list of moves. One node, both faces playing.
//
// The sides take turns through files in MIXED_SYNC, as mixed.node-test.ts
// does. Run by MIXED_SPEC=mixed-table scripts/run-web-depth-mixed.sh.
// Results go through process._rawDebug, because Ink swallows stdout.

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createElement as h } from "react";
import { render } from "ink-testing-library";
import { Client } from "../core/client.ts";
import { App } from "./app.ts";
import { strings } from "./strings.ts";

const node = process.env.DEPTH_NODE_URL!;
const apiKey = process.env.DEPTH_API_KEY!;
const sync = process.env.MIXED_SYNC!;
const run = process.env.MIXED_RUN!;
const out = (line: string) => (process as unknown as { _rawDebug: (s: string) => void })._rawDebug(line);

const settle = (ms = 120) => new Promise((done) => setTimeout(done, ms));
const DOWN = "\u001B[B", RIGHT = "\u001B[C", LEFT = "\u001B[D", ENTER = "\r";
const LAT = "41.9", LON = "12.5";
// The feed's actions by their labels (screens.ts Feed; "open" reads "сесть" on a
// table card): the row is not fixed —
// "снять фразу" stands in it only while one's own phrase is up (W11-B), "стол"
// only at a table, "пожаловаться" only with a complaint handler — so an action
// is found by walking right from the row's start until it is the chosen one,
// not counted by an index that a conditional item shifts (W12-FR, 01.10.2026).
const FEED_LABELS: Record<string, string> = {
  open: "открыть|сесть", like: "лайк", hide: "скрыть", block: "заблокировать", complain: "пожаловаться", write: "написать",
  takedown: "снять фразу", table: "стол", inbox: "входящие", point: "сменить точку", me: "я", exit: "выход",
};

type Screen = { stdin: { write: (s: string) => void }; lastFrame: () => string | undefined; frames?: string[] };

async function type(app: Screen, ...keys: string[]) {
  for (const key of keys) {
    app.stdin.write(key);
    await settle();
  }
}

async function pickInFeed(app: Screen, action: string) {
  const label = FEED_LABELS[action];
  if (!label) throw new Error(`no such action in the feed's row: ${action}`);
  const chosen = new RegExp(`\\[ ${label} \\]`);
  // The row remembers where it was left, so walk to its start first: the
  // helper used to count from zero and landed on "выход", which quit the
  // program mid-run (measured 23.09.2026).
  for (let i = 0; i < 14; i++) await type(app, LEFT);
  for (let i = 0; i < 14 && !chosen.test(app.lastFrame() ?? ""); i++) await type(app, RIGHT);
  if (!chosen.test(app.lastFrame() ?? "")) {
    throw new Error(`the feed's row never offered "${label}":\n${JSON.stringify(app.lastFrame() ?? "").slice(0, 600)}`);
  }
  await type(app, ENTER);
}

async function pick(app: Screen, row: string[], action: string) {
  const steps = row.indexOf(action);
  if (steps < 0) throw new Error(`no such action in the row: ${action}`);
  for (let i = 0; i < row.length; i++) await type(app, LEFT);
  for (let i = 0; i < steps; i++) await type(app, RIGHT);
  await type(app, ENTER);
}

// The table's row changes with the game (no "move" before it starts), so an
// action is found by its label under the cursor, "[ label ]", not by place.
async function pickLabel(app: Screen, label: string) {
  for (let i = 0; i < 10; i++) await type(app, LEFT);
  const on = new RegExp(`\\[ ${label}[^\\]]*\\]`);
  for (let i = 0; i < 10 && !on.test(app.lastFrame() ?? ""); i++) await type(app, RIGHT);
  if (!on.test(app.lastFrame() ?? "")) throw new Error(`no "${label}" in the table's row:\n${app.lastFrame()}`);
  await type(app, ENTER);
}

async function until(app: Screen, what: RegExp, seconds = 20) {
  for (let i = 0; i < seconds * 10; i++) {
    if (what.test(app.lastFrame() ?? "")) return;
    await settle(100);
  }
  out(`последние кадры: ${JSON.stringify((app.frames ?? []).slice(-3)).slice(0, 700)}`);
  throw new Error(`the screen never showed ${what}:\n${JSON.stringify(app.lastFrame() ?? "").slice(0, 900)}`);
}

async function typeUntil(app: Screen, text: string, what: RegExp) {
  await type(app, text);
  await until(app, what);
}

function signal(step: string, body = "") {
  writeFileSync(`${sync}/${step}`, body);
  out(`[sync] depth → ${step}`);
}
async function waitFor(step: string, seconds = 120): Promise<string> {
  for (let i = 0; i < seconds * 10; i++) {
    if (existsSync(`${sync}/${step}`)) return readFileSync(`${sync}/${step}`, "utf8");
    if (existsSync(`${sync}/web-failed`)) throw new Error(`the browser's side failed before "${step}"`);
    await settle(100);
  }
  throw new Error(`the browser's side never reached "${step}"`);
}

async function main() {
  const say = strings("ru");
  const app = render(h(App, { say, client: new Client(node, apiKey), fresh: () => new Client(node, apiKey) }));
  try {
    // 1 · registration through the screens, as mixed.node-test.ts walks it.
    await settle();
    await until(app, /Operator/);
    await typeUntil(app, "Борис", /Борис/);
    await type(app, DOWN);
    await typeUntil(app, "31", /31/);
    await type(app, DOWN, ENTER);
    await until(app, /Ваш ПИН/);
    await typeUntil(app, "482913", /••••••/);
    await type(app, DOWN);
    await typeUntil(app, "482913", /••••••[\s\S]*••••••/);
    await type(app, DOWN, ENTER);
    await until(app, /Запишите этот код/);
    const paper = /([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4})/.exec(app.lastFrame() ?? "");
    assert.ok(paper, "the paper code is not on the screen in four groups");
    await typeUntil(app, paper[2], new RegExp(`${paper[2]}_`));
    await type(app, DOWN);
    await typeUntil(app, paper[4], new RegExp(`${paper[4]}_`));
    await type(app, DOWN, ENTER);
    await until(app, /Где ты/);
    await typeUntil(app, LAT, /41\.9/);
    await type(app, DOWN);
    await typeUntil(app, LON, /12\.5/);
    await type(app, DOWN, DOWN, ENTER);
    await until(app, /signal/);
    out("ok   Борис registered in the terminal and stands at the page's point");

    // 2 · a dots table from the feed's "table", as table.node-test.ts sets one:
    // down to seats (two for dots), down to the name, down into the row, enter.
    const name = `точки ${run}`;
    await pickInFeed(app, "table");
    await until(app, /поставить стол/);
    await type(app, DOWN, DOWN, RIGHT, DOWN);
    await typeUntil(app, name, new RegExp(run));
    await type(app, DOWN, ENTER);
    await until(app, new RegExp(`"${name}"`), 30);
    signal("depth-table", name);
    out("ok   the table was set from the terminal");

    // 3 · Аня sat from her feed and applied; he sees the application and
    // starts the game — alone among the players, the rematch starts it at once.
    await waitFor("web-applied", 180);
    await until(app, /заявка: Аня/, 30);
    await pickLabel(app, "ещё партию");
    await until(app, /ваш ход|ход: Аня/, 30);
    const first = /ваш ход/.test(app.lastFrame() ?? "") ? "depth" : "web";
    signal("depth-started", first);
    out(`ok   the game began, ${first === "depth" ? "the terminal" : "the browser"} moves first`);

    // 4 · a move each, in the node's order.
    const mine = async () => {
      await until(app, /ваш ход/, 30);
      const edge = /ход ([hv]:\d+:\d+)/.exec(app.lastFrame() ?? "")?.[1];
      assert.ok(edge, "no free edge is marked on the terminal's board");
      await pickLabel(app, "ход");
      await until(app, new RegExp(`Борис\\s+\\{"edge":"${edge}"\\}`), 30);
      signal("depth-moved", edge);
      out(`ok   the terminal moved ${edge}`);
    };
    const theirs = async () => {
      const edge = await waitFor("web-moved", 90);
      await until(app, new RegExp(`Аня\\s+\\{"edge":"${edge}"\\}`), 30);
      signal("depth-saw-move", edge);
      out(`ok   the browser's move ${edge} reached the terminal`);
    };
    if (first === "depth") {
      await mine();
      await theirs();
    } else {
      await theirs();
      await mine();
    }
    await waitFor("web-done", 60);
  } catch (e) {
    signal("depth-failed", (e as Error).message);
    throw e;
  } finally {
    app.unmount();
  }
}

main().then(
  () => { out("mixed-table: the terminal's side passed"); process.exit(0); },
  (e) => { out(`FAIL ${(e as Error).message}`); process.exit(1); },
);
