// W10-N5mix · the starters across the two faces (chat spec §8.7, N3/N4).
// Борис walks the depth screens as mixed.node-test.ts does, with a second
// phrase of his own, up to a line each way with Аня in the browser
// (web/e2e/specs/mixed-starters.spec.ts). Then her like on his second phrase
// reaches this open chat as an extra-like card (N3); he goes to the feed,
// likes her second phrase, and his inbox row numbers it fourth when he comes
// back (the card on her page is N4, the browser's side).
//
// The two sides are two processes; they take turns through files in a shared
// directory (MIXED_SYNC): a side writes a step's name when it is done and
// waits for the other's. Run by scripts/run-web-depth-mixed.sh.
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
const DOWN = "\u001B[B", UP = "\u001B[A", RIGHT = "\u001B[C", LEFT = "\u001B[D", ENTER = "\r";
// The page's point (web/src/App.tsx): the terminal stands where the browser does.
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

async function until(app: Screen, what: RegExp, seconds = 20) {
  for (let i = 0; i < seconds * 10; i++) {
    if (what.test(app.lastFrame() ?? "")) return;
    await settle(100);
  }
  out(`последние кадры: ${JSON.stringify((app.frames ?? []).slice(-3)).slice(0, 700)}`);
  throw new Error(`the screen never showed ${what}:\n${JSON.stringify(app.lastFrame() ?? "").slice(0, 600)}`);
}

async function typeUntil(app: Screen, text: string, what: RegExp) {
  await type(app, text);
  await until(app, what);
}

// The other side's turn: a file of that name in the shared directory.
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

// The chat's actions (rooms.ts Chat): send, code, span, end, block, back, game, rekey.
const CHAT_ROW = ["send", "code", "span", "end", "block", "back", "game", "rekey"];
async function pickInChat(app: Screen, action: string) {
  const steps = CHAT_ROW.indexOf(action);
  if (steps < 0) throw new Error(`no such action in the chat's row: ${action}`);
  for (let i = 0; i < CHAT_ROW.length; i++) await type(app, LEFT);
  for (let i = 0; i < steps; i++) await type(app, RIGHT);
  await type(app, ENTER);
}

// The feed read again at the point, the cursor on the card with this text.
async function cursorOnCard(app: Screen, text: string) {
  await pickInFeed(app, "point");
  await until(app, /Где ты/);
  await type(app, DOWN, DOWN, DOWN, ENTER);
  await until(app, new RegExp(text.split(" ").slice(-1)[0]), 60);
  const cursorOn = new RegExp(`›[^\\n]*\\n\\s*${text}`);
  for (let i = 0; i < 12 && !cursorOn.test(app.lastFrame() ?? ""); i++) await type(app, DOWN);
  for (let i = 0; i < 12 && !cursorOn.test(app.lastFrame() ?? ""); i++) await type(app, UP);
  await until(app, cursorOn, 10);
}

async function main() {
  const say = strings("ru");
  const app = render(h(App, { say, client: new Client(node, apiKey), fresh: () => new Client(node, apiKey) }));
  try {
    // 1 · registration through the screens, as live.node-test.ts walks it.
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

    // 2 · his phrase, from the terminal's composer.
    const mine = `иду к мосту ${run}`;
    await pickInFeed(app, "write");
    await until(app, /0\/\d+/);
    await typeUntil(app, mine, new RegExp(run));
    await type(app, DOWN, ENTER); // the actions: send
    await until(app, /signal/, 30);
    signal("depth-phrase", mine);
    out("ok   the phrase went from the terminal");
    const mineToo = `и ещё иду ${run}`;
    await pickInFeed(app, "write");
    await until(app, /0\/\d+/);
    await typeUntil(app, mineToo, new RegExp(run));
    await type(app, DOWN, ENTER);
    await until(app, /signal/, 30);
    signal("depth-phrase-2", mineToo);
    out("ok   the second phrase went from the terminal");

    // 3 · Аня liked it in the browser; the feed read again, her phrase liked
    // from the terminal makes the match.
    const hers = await waitFor("web-liked");
    const hersToo = `и ещё гуляю ${run}`; // her second phrase, as the spec names it
    await pickInFeed(app, "point");
    await until(app, /Где ты/);
    await type(app, DOWN, DOWN, DOWN, ENTER);
    await until(app, new RegExp(hers.split(" ").slice(-1)[0]), 60);
    const cursorOn = new RegExp(`›[^\\n]*\\n\\s*${hers}`);
    for (let i = 0; i < 12 && !cursorOn.test(app.lastFrame() ?? ""); i++) await type(app, DOWN);
    for (let i = 0; i < 12 && !cursorOn.test(app.lastFrame() ?? ""); i++) await type(app, UP);
    await until(app, cursorOn, 10);
    await pickInFeed(app, "like");
    signal("depth-liked");
    out("ok   the like from the terminal went to the node");

    // 4 · she agreed on the page; the match on his inbox opens the conversation.
    await waitFor("web-agreed");
    await pickInFeed(app, "inbox");
    await until(app, /входящие/);
    await until(app, /мэтч/, 30);
    await type(app, ENTER);
    await until(app, /истории на диске нет/, 30);
    signal("depth-in-chat");
    out("ok   the conversation opened in the terminal");

    // 5 · a line each way.
    const heard = await waitFor("web-said");
    await until(app, new RegExp(heard), 30);
    out("ok   the browser's line reached the terminal");
    const reply = `слышу из терминала ${run}`;
    await typeUntil(app, reply, new RegExp(reply));
    await type(app, DOWN, ENTER); // the actions under the field: send (rooms.ts Chat)
    signal("depth-said", reply);
    const next = await waitFor("web-heard", 60);
    out("ok   the terminal's line reached the browser");

    assert.equal(next, "starters", `the browser's spec asked for "${next}", this side knows "starters"`);
    // The two starters of the match, numbered: hers liked his first.
    await until(app, /Понравилось, по порядку/, 20);
    assert.match(app.lastFrame() ?? "", /1\. Собеседнику понравилось: «иду к мосту/, "the first starter is not his phrase, liked by her");

    // 6 · N3 · her like on his second phrase, while this chat is open: the
    // extra-like card, numbered third, and the third row in the block.
    const likedToo = await waitFor("web-liked-2", 90);
    await until(app, /3\. вашему собеседнику понравилось ещё одно ваше сообщение/, 30);
    assert.match(app.lastFrame() ?? "", new RegExp(`3\\. Собеседнику понравилось: «${likedToo}»`), "the third starter is not her like on the second phrase");
    assert.match(app.lastFrame() ?? "", /[┌╭]/, "the extra like is not drawn as a card");
    signal("depth-saw-extra");
    out("ok   her like from the page came as a card in the open terminal chat (N3)");

    // 7 · N4 · his like on her second phrase, from the feed: the page, with
    // its chat open, gets the card; his inbox row numbers it fourth.
    await waitFor("web-in-chat-2", 90);
    await pickInChat(app, "back");
    await until(app, /входящие/);
    await type(app, RIGHT, ENTER); // the row's actions: open, back
    await until(app, /signal/, 30);
    await cursorOnCard(app, hersToo);
    await pickInFeed(app, "like");
    signal("depth-liked-2");
    out("ok   the like on her second phrase went from the terminal");
    await waitFor("web-saw-extra", 90);
    await pickInFeed(app, "inbox");
    await until(app, /входящие/);
    await until(app, /чат открыт/, 30);
    await type(app, ENTER);
    await until(app, /Понравилось, по порядку/, 30);
    await until(app, new RegExp(`4\\. Вам понравилось: «${hersToo}»`), 30);
    signal("depth-in-chat-2");
    out("ok   back in the conversation, the fourth starter is his like, numbered by the inbox");
  } catch (e) {
    signal("depth-failed", (e as Error).message);
    throw e;
  } finally {
    app.unmount();
  }
}

main().then(
  () => { out("mixed-starters: the terminal's side passed"); process.exit(0); },
  (e) => { out(`FAIL ${(e as Error).message}`); process.exit(1); },
);
