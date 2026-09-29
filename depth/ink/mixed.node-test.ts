// Q6 · the two people's path with one of them in the terminal: Борис walks the
// depth screens against the web stand's node while Аня walks the page in a
// browser (web/e2e/specs/mixed-depth.spec.ts). Each registers, writes a phrase
// at the page's point, they like each other, agree, and a line goes each way.
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

const FEED_ROW = ["open", "like", "hide", "block", "complain", "write", "table", "inbox", "point", "me", "exit"];

type Screen = { stdin: { write: (s: string) => void }; lastFrame: () => string | undefined; frames?: string[] };

async function type(app: Screen, ...keys: string[]) {
  for (const key of keys) {
    app.stdin.write(key);
    await settle();
  }
}

async function pickInFeed(app: Screen, action: string) {
  const steps = FEED_ROW.indexOf(action);
  if (steps < 0) throw new Error(`no such action in the feed's row: ${action}`);
  for (let i = 0; i < FEED_ROW.length; i++) await type(app, LEFT);
  for (let i = 0; i < steps; i++) await type(app, RIGHT);
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

    // 3 · Аня liked it in the browser; the feed read again, her phrase liked
    // from the terminal makes the match.
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

    // 6 · new keys (T19), only when the browser's spec says "rekey": he asks
    // from the chat's actions, she agrees on the page, and her line under the
    // new epoch opens here — with the keys both now hold, not the old ones.
    // The terminal asks because the page offers asking only once its keys
    // failed (web/src/screens/Chat.tsx); agreeing it offers always.
    if (next === "rekey") {
      // The chat's actions: send, code, span, end, block, back, game, rekey.
      for (let i = 0; i < 8; i++) await type(app, LEFT);
      for (let i = 0; i < 7; i++) await type(app, RIGHT);
      await type(app, ENTER);
      await until(app, /Просьба о новых ключах отправлена/, 30);
      signal("depth-asked-rekey");
      out("ok   the terminal asked for new keys");
      await waitFor("web-agreed-rekey", 90);
      await until(app, /Ключи беседы обновлены \(эпоха \d+\)/, 30);
      const epoch = /Ключи беседы обновлены \(эпоха (\d+)\)/.exec(app.lastFrame() ?? "")![1];
      signal("depth-rekeyed", epoch);
      out(`ok   the terminal holds the new keys at epoch ${epoch}`);
      const after = await waitFor("web-said-rekeyed", 60);
      await until(app, new RegExp(after), 30);
      signal("depth-heard-rekeyed");
      out("ok   the browser's line under the new keys reached the terminal");
    }
  } catch (e) {
    signal("depth-failed", (e as Error).message);
    throw e;
  } finally {
    app.unmount();
  }
}

main().then(
  () => { out("mixed: the terminal's side passed"); process.exit(0); },
  (e) => { out(`FAIL ${(e as Error).message}`); process.exit(1); },
);
