// W12-RM · the paper code raises an identity across the two faces. Борис walks
// the depth screens as mixed.node-test.ts does, up to a line each way with Аня
// in the browser (web/e2e/specs/mixed-restore.spec.ts). Then her paper code
// raises her in a clean terminal (`depth restore`): a new PIN, the code it
// shows written down, the feed, the conversation in the inbox — with no pair
// for it (§8.2: "прежние беседы молчат, пока ключ не перевыпущен"), so it
// asks for new keys, Борис agrees, and a line goes each way at epoch 1. The
// code it showed goes back to the browser, which raises her on a clean page
// and asks for new keys in its turn: Борис agrees again, epoch 2, a line each way.
//
// The two processes take turns through files in MIXED_SYNC, as mixed.node-test.ts.
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

// The feed's actions by their labels: the row is not fixed — "снять фразу"
// stands in it only while one's own phrase is up (W11-B), "стол" only at a
// table — so an action is found by walking right until it is the chosen one.
const FEED_LABELS: Record<string, string> = { like: "лайк", write: "написать", inbox: "входящие", point: "сменить точку", me: "я" };
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
async function pickInFeed(app: Screen, action: string) {
  const label = FEED_LABELS[action];
  if (!label) throw new Error(`no such action in the feed's row: ${action}`);
  const chosen = new RegExp(`\\[ ${label} \\]`);
  for (let i = 0; i < 14; i++) await type(app, LEFT);
  for (let i = 0; i < 14 && !chosen.test(app.lastFrame() ?? ""); i++) await type(app, RIGHT);
  if (!chosen.test(app.lastFrame() ?? "")) throw new Error(`the feed's row never offered "${label}":\n${JSON.stringify(app.lastFrame() ?? "").slice(0, 600)}`);
  await type(app, ENTER);
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

// The point, typed on "Где ты": the feed after it.
async function standAtThePoint(app: Screen) {
  await until(app, /Где ты/, 30);
  await typeUntil(app, LAT, /41\.9/);
  await type(app, DOWN);
  await typeUntil(app, LON, /12\.5/);
  await type(app, DOWN, DOWN, ENTER);
  await until(app, /signal/, 30);
}

async function main() {
  const say = strings("ru");
  const app = render(h(App, { say, client: new Client(node, apiKey), fresh: () => new Client(node, apiKey) }));
  let raised: ReturnType<typeof render> | null = null;
  try {
    // 1 · Борис registers through the screens, as mixed.node-test.ts walks it.
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
    await standAtThePoint(app);
    out("ok   Борис registered in the terminal and stands at the page's point");

    // 2 · his phrase.
    const mine = `иду к мосту ${run}`;
    await pickInFeed(app, "write");
    await until(app, /0\/\d+/);
    await typeUntil(app, mine, new RegExp(run));
    await type(app, DOWN, ENTER);
    await until(app, /signal/, 30);
    signal("depth-phrase", mine);
    out("ok   the phrase went from the terminal");

    // 3 · Аня liked it; her phrase liked from here makes the match.
    const hers = await waitFor("web-liked");
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

    // 4 · she agreed; the match on his inbox opens the conversation.
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
    await type(app, DOWN, ENTER);
    signal("depth-said", reply);
    const next = await waitFor("web-heard", 60);
    assert.equal(next, "restore", `the browser's spec asked for "${next}", this side knows "restore"`);
    out("ok   the terminal's line reached the browser");

    // 6 · her paper code raises her in a clean terminal: typed the way it
    // comes off the paper, a new PIN, the new code written down, the point.
    const code = await waitFor("web-paper-code", 90);
    raised = render(h(App, { say, client: new Client(node, apiKey), fresh: () => new Client(node, apiKey), start: "restore" }));
    await until(raised, /Бумажный код/);
    const typed = code.trim().toLowerCase().replace(/ /g, "-");
    await typeUntil(raised, typed, new RegExp(typed.slice(-4)));
    await type(raised, DOWN, ENTER);
    await until(raised, /Ваш ПИН/, 30);
    await typeUntil(raised, "246813", /••••••/);
    await type(raised, DOWN);
    await typeUntil(raised, "246813", /••••••[\s\S]*••••••/);
    await type(raised, DOWN, ENTER);
    await until(raised, /Запишите этот код/, 30);
    const fresh = /([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4})/.exec(raised.lastFrame() ?? "");
    assert.ok(fresh, "the new paper code is not on the screen in four groups");
    await typeUntil(raised, fresh[2], new RegExp(`${fresh[2]}_`));
    await type(raised, DOWN);
    await typeUntil(raised, fresh[4], new RegExp(`${fresh[4]}_`));
    await type(raised, DOWN, ENTER);
    await standAtThePoint(raised);
    out("ok   the paper code raised Аня in the terminal; the feed is there");

    // 7 · the conversation is in her inbox, with no pair for it: she asks for
    // new keys, Борис agrees, both hold epoch 1, and a line goes each way.
    await pickInFeed(raised, "inbox");
    await until(raised, /входящие/);
    await until(raised, /чат открыт/, 30);
    out("ok   the conversation is in the raised terminal's inbox");
    await type(raised, ENTER);
    await until(raised, /попросить новые ключи/, 30);
    await type(raised, DOWN);
    await pickInChat(raised, "rekey");
    await until(raised, /Просьба о новых ключах отправлена/, 30);
    await until(app, /Собеседник просит новые ключи/, 30);
    await pickInChat(app, "rekey");
    await until(app, /Ключи беседы обновлены \(эпоха 1\)/, 30);
    out("ok   Борис agreed; both terminals hold the new keys at epoch 1");
    await pickInChat(raised, "back");
    await until(raised, /входящие/);
    await until(raised, /чат открыт/, 30);
    await type(raised, ENTER);
    await until(raised, /истории на диске нет/, 30);
    const afterRaise = `поднялась в терминале ${run}`;
    await typeUntil(raised, afterRaise, new RegExp(run));
    await type(raised, DOWN, ENTER);
    await until(app, new RegExp(afterRaise), 30);
    const toRaised = `слышно, ключи новые ${run}`;
    await type(app, UP);
    await typeUntil(app, toRaised, new RegExp(toRaised));
    await type(app, DOWN);
    await pickInChat(app, "send");
    await until(raised, new RegExp(toRaised), 30);
    out("ok   a line each way between the raised terminal and Борис at epoch 1");
    signal("depth-raised", fresh.slice(1).join(" "));

    // 8 · the browser raised her by the code this terminal showed; its page
    // holds no wrap and asks for new keys — Борис agrees once more, epoch 2.
    await waitFor("web-asked-rekey", 180);
    raised.unmount(); raised = null;
    await until(app, /Собеседник просит новые ключи/, 30);
    await pickInChat(app, "rekey");
    await until(app, /Ключи беседы обновлены \(эпоха 2\)/, 30);
    signal("depth-agreed-rekey");
    out("ok   Борис agreed with the raised page; his terminal holds epoch 2");

    // 9 · a line each way with the raised page.
    const fromPage = await waitFor("web-said-raised", 60);
    await until(app, new RegExp(fromPage), 30);
    out("ok   the raised page's line reached the terminal");
    const toPage = `слышно и страницу ${run}`;
    await type(app, UP);
    await typeUntil(app, toPage, new RegExp(toPage));
    await type(app, DOWN);
    await pickInChat(app, "send");
    signal("depth-said-raised", toPage);
    await waitFor("web-heard-raised", 60);
    out("ok   the terminal's line reached the raised page");
  } catch (e) {
    signal("depth-failed", (e as Error).message);
    throw e;
  } finally {
    raised?.unmount();
    app.unmount();
  }
}

main().then(
  () => { out("mixed-restore: the terminal's side passed"); process.exit(0); },
  (e) => { out(`FAIL ${(e as Error).message}`); process.exit(1); },
);
