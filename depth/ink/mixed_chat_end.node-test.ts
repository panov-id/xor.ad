// W11-MB · the end of a conversation between the two faces, the terminal's
// side. Борис walks the depth screens as mixed.node-test.ts does, twice: with
// Аня to a line each way, then he ends the conversation from the chat's row
// («закончить беседу») — the page sees the plain tombstone; with Вера to a line
// each way, then she blocks on the page — this screen shows «Беседа
// закончилась.» (the node's 4003), and back in the feed her phrase is gone
// (§8.9). The browser's side is web/e2e/specs/mixed-chat-end.spec.ts; the two
// processes take turns through files in MIXED_SYNC. Results go through
// process._rawDebug, because Ink swallows stdout.

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

// The feed's actions by their labels: the row is not fixed — "снять фразу"
// stands in it only while one's own phrase is up (W11-B) — so an action is
// found by walking right until it is the chosen one (W12-FR).
const FEED_LABELS: Record<string, string> = { like: "лайк", write: "написать", inbox: "входящие", point: "сменить точку" };
// The chat's actions (rooms.ts Chat): send, code, span, end, block, back, game, rekey.
const CHAT_ROW = ["send", "code", "span", "end", "block", "back", "game", "rekey"];

type Screen = { stdin: { write: (s: string) => void }; lastFrame: () => string | undefined; frames?: string[] };

async function type(app: Screen, ...keys: string[]) {
  for (const key of keys) {
    app.stdin.write(key);
    await settle();
  }
}

async function pickIn(app: Screen, row: string[], action: string) {
  const steps = row.indexOf(action);
  if (steps < 0) throw new Error(`no such action in the row: ${action}`);
  for (let i = 0; i < row.length; i++) await type(app, LEFT);
  for (let i = 0; i < steps; i++) await type(app, RIGHT);
  await type(app, ENTER);
}
async function pickByLabel(app: Screen, label: string, width = 14) {
  const chosen = new RegExp(`\\[ ${label} \\]`);
  for (let i = 0; i < width; i++) await type(app, LEFT);
  for (let i = 0; i < width && !chosen.test(app.lastFrame() ?? ""); i++) await type(app, RIGHT);
  if (!chosen.test(app.lastFrame() ?? "")) throw new Error(`the row never offered "${label}":\n${JSON.stringify(app.lastFrame() ?? "").slice(0, 600)}`);
  await type(app, ENTER);
}
async function pickInFeed(app: Screen, action: string) {
  const label = FEED_LABELS[action];
  if (!label) throw new Error(`no such action in the feed's row: ${action}`);
  await pickByLabel(app, label);
}
const pickInChat = (app: Screen, action: string) => pickIn(app, CHAT_ROW, action);

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

// The feed read again: the point typed anew (mixed.node-test.ts step 3).
async function rereadFeed(app: Screen) {
  await pickInFeed(app, "point");
  await until(app, /Где ты/);
  await type(app, DOWN, DOWN, DOWN, ENTER);
  await until(app, /signal/, 30);
}

// One round with the person the browser names: his phrase, her like, his like
// (the match), her consent, the conversation, a line each way. Returns her phrase.
async function meetAndTalk(app: Screen, r: string): Promise<string> {
  const mine = `иду к мосту ${r} ${run}`;
  await pickInFeed(app, "write");
  await until(app, /0\/\d+/);
  await typeUntil(app, mine, new RegExp(run));
  await type(app, DOWN, ENTER);
  await until(app, /signal/, 30);
  signal(`depth-phrase-${r}`, mine);
  out(`ok   [${r}] the phrase went from the terminal`);

  const hers = await waitFor(`web-liked-${r}`);
  await rereadFeed(app);
  await until(app, new RegExp(hers), 60);
  const cursorOn = new RegExp(`›[^\\n]*\\n\\s*${hers}`);
  for (let i = 0; i < 12 && !cursorOn.test(app.lastFrame() ?? ""); i++) await type(app, DOWN);
  for (let i = 0; i < 12 && !cursorOn.test(app.lastFrame() ?? ""); i++) await type(app, UP);
  await until(app, cursorOn, 10);
  await pickInFeed(app, "like");
  signal(`depth-liked-${r}`);
  out(`ok   [${r}] the like from the terminal went to the node`);

  await waitFor(`web-agreed-${r}`);
  await pickInFeed(app, "inbox");
  await until(app, /входящие/);
  await until(app, /мэтч/, 30);
  await type(app, ENTER);
  await until(app, /истории на диске нет/, 30);
  signal(`depth-in-chat-${r}`);
  out(`ok   [${r}] the conversation opened in the terminal`);

  const heard = await waitFor(`web-said-${r}`);
  await until(app, new RegExp(heard), 30);
  const reply = `слышу из терминала ${r} ${run}`;
  await typeUntil(app, reply, new RegExp(reply));
  await type(app, DOWN, ENTER);
  signal(`depth-said-${r}`, reply);
  out(`ok   [${r}] a line each way`);
  return hers;
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
    await until(app, /Где ты/, 30);
    await typeUntil(app, LAT, /41\.9/);
    await type(app, DOWN);
    await typeUntil(app, LON, /12\.5/);
    await type(app, DOWN, DOWN, ENTER);
    await until(app, /signal/, 30);
    out("ok   Борис registered in the terminal and stands at the page's point");

    // 2 · round one, Аня: he ends the conversation by hand — DELETE /chats/:id
    // from the chat's row, no second asking (rooms.ts: ending is plain,
    // blocking asks twice); back in the inbox, the row is gone.
    await meetAndTalk(app, "one");
    await waitFor("web-heard-one", 60);
    await pickInChat(app, "end");
    await until(app, /входящие/, 30);
    signal("depth-ended");
    out("ok   [one] the terminal ended the conversation");
    await waitFor("web-saw-end", 60);
    await until(app, /пока пусто/, 30);
    out("ok   [one] the conversation is out of his inbox");
    // Back to the feed for the second person.
    await pickByLabel(app, "назад", 4);
    await until(app, /signal/, 30);

    // 3 · round two, Вера: she blocks on the page — this room closes 4003 and
    // the tombstone says the conversation ended, not why (§8.9: the one
    // blocked is never told); her phrase is out of his feed.
    const hers = await meetAndTalk(app, "two");
    const blocked = await waitFor("web-blocked", 90);
    assert.equal(blocked, hers, "the browser blocked with another phrase than this side liked");
    await until(app, /Беседа закончилась\./, 30);
    assert.ok(!/заблокир/.test(app.lastFrame() ?? ""), "the one blocked was told it was a block");
    signal("depth-saw-end");
    out("ok   [two] the terminal saw the conversation end after the page's block");
    // «Вернуться в ленту», then the feed read again at the point: her phrase
    // is not in it — a block hides the phrases both ways (§8.9).
    await type(app, ENTER);
    await until(app, /signal/, 30);
    await rereadFeed(app);
    await settle(1500);
    assert.ok(!(app.lastFrame() ?? "").includes(hers), `the blocked person's phrase is still in the feed:\n${JSON.stringify(app.lastFrame() ?? "").slice(0, 600)}`);
    signal("depth-feed-clean");
    out("ok   [two] her phrase is out of his feed");
  } catch (e) {
    signal("depth-failed", (e as Error).message);
    throw e;
  } finally {
    app.unmount();
  }
}

main().then(
  () => { out("mixed-chat-end: the terminal's side passed"); process.exit(0); },
  (e) => { out(`FAIL ${(e as Error).message}`); process.exit(1); },
);
