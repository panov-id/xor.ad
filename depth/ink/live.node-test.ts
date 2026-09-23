// The screens against a live node: one person walks the terminal from the
// first screen to a sealed message, and the other side is the core, the way
// another terminal would be.
//
// Why this exists: the screens' own tests type into them with no node behind,
// so they prove the keys and the layout, not that the face and the protocol
// fit each other. This one registers for real, reads a real feed, likes, gets
// a real match, consents, and writes into a real chat.
//
// The stand is made by scripts/run-depth-live-ui.sh: its node, its database.
// Results go through process._rawDebug, because Ink swallows stdout.

import assert from "node:assert/strict";
import { createElement as h } from "react";
import { render } from "ink-testing-library";
import postgres from "postgres";
import { Client } from "../core/client.ts";
import { App } from "./app.ts";
import { strings } from "./strings.ts";

const node = process.env.DEPTH_NODE_URL!;
const apiKey = process.env.DEPTH_API_KEY!;
const databaseUrl = process.env.DEPTH_DATABASE_URL!;
const out = (line: string) => (process as unknown as { _rawDebug: (s: string) => void })._rawDebug(line);

const settle = (ms = 120) => new Promise((done) => setTimeout(done, ms));
const DOWN = "\u001B[B", RIGHT = "\u001B[C", LEFT = "\u001B[D", ENTER = "\r";

// The feed's row of actions, in the order the screen draws it. Counting
// presses by hand broke the moment two actions were inserted, so the test
// names what it wants instead.
const FEED_ROW = ["like", "hide", "block", "write", "inbox", "point", "me", "exit"];

async function pickInFeed(app: { stdin: { write: (s: string) => void } }, action: string) {
  const steps = FEED_ROW.indexOf(action);
  if (steps < 0) throw new Error(`no such action in the feed's row: ${action}`);
  // The row remembers where it was left, so walk to its start first: the
  // helper used to count from zero and landed on "выход", which quit the
  // program mid-run (measured 23.09.2026).
  for (let i = 0; i < FEED_ROW.length; i++) await type(app, LEFT);
  for (let i = 0; i < steps; i++) await type(app, RIGHT);
  await type(app, ENTER);
}

async function type(app: { stdin: { write: (s: string) => void } }, ...keys: string[]) {
  for (const key of keys) {
    app.stdin.write(key);
    await settle();
  }
}

// Wait for something to show up on the screen; a live node answers in its own
// time, and a fixed sleep would either be slow or flaky.
async function until(app: { lastFrame: () => string | undefined; frames?: string[] }, what: RegExp, seconds = 20) {
  for (let i = 0; i < seconds * 10; i++) {
    if (what.test(app.lastFrame() ?? "")) return;
    await settle(100);
  }
  const frame = app.lastFrame() ?? "";
  out(`последние кадры: ${JSON.stringify((app.frames ?? []).slice(-3)).slice(0, 700)}`);
  throw new Error(
    `the screen never showed ${what} (кадр длиной ${frame.length}):\n${JSON.stringify(frame).slice(0, 600)}`,
  );
}

// Type and check, retrying: a screen that has just mounted can miss the keys
// pressed in the very same tick — Ink subscribes to input in an effect, after
// the first render. A person hitting a key the instant a screen appears meets
// the same thing; it is worth knowing, and it is not what this run measures.
async function typeUntil(
  app: { stdin: { write: (s: string) => void }; lastFrame: () => string | undefined },
  text: string,
  what: RegExp,
  tries = 4,
) {
  for (let i = 0; i < tries; i++) {
    await type(app, text);
    await settle(200);
    if (what.test(app.lastFrame() ?? "")) return;
  }
  throw new Error(`"${text}" never landed on the screen:\n${app.lastFrame()}`);
}

async function main() {
  const sql = postgres(databaseUrl, { max: 1 });
  const say = strings("ru");
  const app = render(h(App, { say, client: new Client(node, apiKey) }));
  let failed = 0;
  try {
    // 1 · registration, through the screen.
    await settle();
    await until(app, /Operator/);
    await typeUntil(app, "Аня", /Аня/);
    await type(app, DOWN);
    await typeUntil(app, "27", /27/);
    await type(app, DOWN, ENTER);
    await until(app, /Где ты/);
    out("ok   registration went through the screens");

    // 2 · the location, then the feed. Each value is waited for on the screen
    // before the next key: a freshly mounted screen can miss keys pressed in
    // the same tick it appears, and blind typing turned that into a run that
    // failed one time in three (measured 2026-09-22).
    await typeUntil(app, "59.9343", /59\.9343/);
    await type(app, DOWN);
    await typeUntil(app, "30.3351", /30\.3351/);
    await type(app, DOWN, DOWN, ENTER);
    await until(app, /signal/);
    out("ok   the location screen opened the feed");

    // The counter must show the node's number, not one this client carries:
    // the terminal used to say 146 while the node refused at 128.
    const stated = (await new Client(node, apiKey).limits()).phrase_length;
    await pickInFeed(app, "write");
    await until(app, new RegExp(`0/${stated}`), 20);
    out(`ok   the phrase counter shows the node's own limit (${stated})`);
    await type(app, DOWN, RIGHT, ENTER); // the phrase screen: back
    await until(app, /signal/);

    // The other side: the core, and a phrase put where the feed will find it.
    const peer = new Client(node, apiKey);
    await peer.register({ name: "Марк", age: 29 }, { testOnly: true });
    await peer.confirmPaperCode();
    const phraseId = crypto.randomUUID();
    await sql.unsafe(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'sosed', $2, 'кто на пробежку вдоль реки', 'alone', 'und', 59.9343, 30.3351, 1000,
         59.9343, 30.3351, now(), now() + interval '3 hours')`,
      [phraseId, peer.identityId],
    );

    // 3 · the feed shows it. The screen reloads when the point is set again.
    await pickInFeed(app, "point");
    await until(app, /Где ты/);
    await type(app, DOWN, DOWN, DOWN, ENTER);  // straight on: the point is still filled in
    await until(app, /пробежку/, 30);
    out("ok   a live phrase reached the feed screen");

    // Hiding from the row, and back from the hidden list: the person's own
    // feed only, and reversible (§8.9).
    await pickInFeed(app, "hide");
    await settle(400);
    assert.equal(/пробежку/.test(app.lastFrame() ?? ""), false, "a hidden phrase stayed on the screen");
    // "me" now holds the lists (§4.11): name, age, liked, hidden.
    await pickInFeed(app, "me");
    await until(app, /скрытое · 1/, 20);
    await type(app, DOWN, DOWN, DOWN, ENTER);
    await until(app, /пробежку/, 20);
    await type(app, DOWN, ENTER); // bring it back
    await settle(400);
    await type(app, RIGHT, ENTER); // the hidden list: back to "me"
    await until(app, /скрытое/, 20);
    await type(app, RIGHT, ENTER); // "me": back to the feed
    await until(app, /пробежку/, 20);
    out("ok   a phrase hidden from the feed came back from the hidden list");

    // 4 · a like each way makes a match. The screen likes the peer's phrase;
    // the peer likes a phrase put in for this identity, because a phrase
    // written from the screen is still waiting for the queue's verdict.
    const [me] = await sql`SELECT id FROM identities WHERE name = 'Аня' ORDER BY created_at DESC LIMIT 1`;
    assert.ok(me?.id, "the registration from the screen left no identity");
    const minePhrase = crypto.randomUUID();
    await sql.unsafe(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'sosed', $2, 'гуляю у реки', 'alone', 'und', 59.9343, 30.3351, 1000,
         59.9343, 30.3351, now(), now() + interval '3 hours')`,
      [minePhrase, me.id],
    );
    await pickInFeed(app, "like");
    await settle(500);
    const back = await peer.like(minePhrase);
    assert.ok(back.body.match_id, "the like from the screen never reached the node");
    out("ok   the like from the screen made a match");

    // 5 · the liked phrase is on the "liked" screen, served by GET /likes, and
    // stands there as an offer to talk now that a match came out of it; its
    // one action leads to the inbox (§4.10).
    await peer.consent(back.body.match_id!);
    await pickInFeed(app, "me");
    await until(app, /лайкнутое/, 20);
    await type(app, DOWN, DOWN, ENTER);
    await until(app, /предложение поговорить/, 20);
    out("ok   the liked screen shows the match that came out of the like");
    await type(app, ENTER);
    await until(app, /входящие/);
    // "Not now" and "undo" against the node itself (§4.6): the match leaves the
    // node's inbox and comes back to it, and only then is it agreed to.
    await until(app, /не сейчас/, 20);
    await type(app, RIGHT, ENTER);
    await until(app, /отклонено/, 20);
    await type(app, LEFT, ENTER);
    await until(app, /мэтч/, 20);
    out("ok   'not now' and 'undo' went to the node and back");
    await type(app, ENTER);
    await until(app, /Марк/, 30);
    out("ok   the inbox screen opened the conversation");

    // 6 · the safety code, from the chat's menu — the twenty digits derived
    // from both long keys, which is what the whole of §8.13 rests on.
    await type(app, DOWN, "\u001B[C", ENTER);
    await until(app, /\d{4} \d{4} \d{4} \d{4} \d{4}/, 30);
    const shown = (app.lastFrame() ?? "").match(/\d{4} \d{4} \d{4} \d{4} \d{4}/)![0];
    const [peerChat] = await sql`SELECT chat_id FROM chat_participants WHERE identity = ${peer.identityId} LIMIT 1`;
    const theirs = (await peer.openConversation(peerChat.chat_id, back.body.match_id!)).safetyCode;
    assert.equal(shown, theirs, "the two sides show different safety codes");
    out("ok   both sides show the same safety code");

    // 7 · one's own span, changed from the chat and kept by the node (§8.6):
    // "compared" closes the panel, the row is still on "code", one step right
    // is "own span", and an hour steps to "while we're talking", 260.
    await type(app, ENTER);
    await settle(300);
    await type(app, RIGHT, ENTER);
    await until(app, /гаснет после 4:20/, 20);
    const [mine] = await sql`SELECT p.idle_ttl_minutes AS span FROM chat_participants p
                              JOIN identities i ON i.id = p.identity
                             WHERE p.chat_id = ${peerChat.chat_id} AND i.name = 'Аня'`;
    assert.equal(Number(mine?.span), 260, "the span changed on the screen but not on the node");
    out("ok   the chat's own span went to the node");

    // 8 · the other side ends the conversation: the node closes the room with
    // 4003 and the screen becomes the tombstone (chat §5, protocol §4.4).
    await peer.closeChat(peerChat.chat_id);
    await until(app, /Беседа закончилась\./, 20);
    out("ok   a conversation ended by the other side became a tombstone");

    // 9 · stepping away against the node (§8.2): from the tombstone to the
    // feed, "me" → "step away" (after name, age, liked and hidden), twenty minutes, and
    // back again with the second press the away screen asks for.
    await type(app, ENTER);
    await until(app, /signal/, 20);
    await pickInFeed(app, "me");
    await until(app, /отойти/, 20);
    await type(app, DOWN, DOWN, DOWN, DOWN, ENTER);
    await until(app, /выберите срок/, 20);
    await type(app, DOWN, ENTER);
    await until(app, /Вы отошли\./, 20);
    const [awayRow] = await sql`SELECT stepped_away_until > now() AS away FROM identities WHERE id = ${me.id}`;
    assert.equal(awayRow?.away, true, "the screen says away and the node does not");
    await type(app, ENTER, ENTER);
    await until(app, /signal/, 20);
    const [backRow] = await sql`SELECT stepped_away_until <= now() AS back FROM identities WHERE id = ${me.id}`;
    assert.equal(backRow?.back, true, "coming back on the screen did not reach the node");
    out("ok   stepping away and coming back went to the node");

    // 10 · the name, edited from "me" against the node: the step away took the
    // phrases, so the slate is clean and the new name goes to the queue (202).
    await pickInFeed(app, "me");
    await until(app, /имя/, 20);
    await type(app, ENTER);
    await until(app, /меняется на чистом счету/, 20);
    await type(app, ..."\u007F\u007F\u007F".split(""), ..."Анна".split(""), DOWN, ENTER);
    await until(app, /Анна/, 20);
    const [named] = await sql`SELECT name_pending FROM identities WHERE id = ${me.id}`;
    assert.equal(named?.name_pending, "Анна", "the new name did not reach the node's queue");
    out("ok   a name edited from the screen went to the queue");
  } catch (e) {
    failed++;
    out(`FAIL ${(e as Error).message}`);
  } finally {
    app.unmount();
    await sql.end();
  }
  out(failed === 0 ? "пройдено: живой прогон экранов" : `провалено: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
