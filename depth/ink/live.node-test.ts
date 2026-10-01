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
import { ChatGames } from "../core/chat_games.ts";
import { Client } from "../core/client.ts";
import { openTable, Tables } from "../core/tables.ts";
import { newPaperCode } from "../core/paper.ts";
import { raise } from "../core/recovery.ts";
import { HeldKey } from "../core/transfer.ts";
import { Arrival, Departure } from "../core/transfer_move.ts";
import { App } from "./app.ts";
import { SeatedElsewhere, TableRoom } from "./table.ts";
import { Feed } from "./screens.ts";
import { Complaint } from "./screens/complaint.ts";
import { strings } from "./strings.ts";

const node = process.env.DEPTH_NODE_URL!;
const apiKey = process.env.DEPTH_API_KEY!;
const databaseUrl = process.env.DEPTH_DATABASE_URL!;
const out = (line: string) => (process as unknown as { _rawDebug: (s: string) => void })._rawDebug(line);

const settle = (ms = 120) => new Promise((done) => setTimeout(done, ms));
const DOWN = "\u001B[B", UP = "\u001B[A", RIGHT = "\u001B[C", LEFT = "\u001B[D", ENTER = "\r";

// The feed's row of actions, in the order the screen draws it. Counting
// presses by hand broke the moment two actions were inserted, so the test
// names what it wants instead.
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

async function pickInFeed(app: { stdin: { write: (s: string) => void }; lastFrame: () => string | undefined }, action: string) {
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

// Type once, then wait for it on the screen. This used to type again when the
// text had not shown within 200 ms, because a freshly mounted screen missed
// keys (Ink subscribed in a passive effect). Since 26.09.2026 every screen
// takes keys through parts.ts useKeys, which holds them for the screen the
// previous key opened — so nothing is missed, and typing again would type the
// text twice on a slow machine (B9).
async function typeUntil(
  app: { stdin: { write: (s: string) => void }; lastFrame: () => string | undefined },
  text: string,
  what: RegExp,
) {
  await type(app, text);
  await until(app, what);
}

// A row the node must have before the run goes on: asked, not slept on.
async function rowAppears(sql: postgres.Sql, text: string, args: unknown[], seconds = 20) {
  for (let i = 0; i < seconds * 10; i++) {
    if ((await sql.unsafe(text, args as string[])).length > 0) return;
    await settle(100);
  }
  throw new Error(`the node never wrote: ${text} ${JSON.stringify(args)}`);
}

async function main() {
  const sql = postgres(databaseUrl, { max: 1 });
  const say = strings("ru");
  const app = render(h(App, { say, client: new Client(node, apiKey), fresh: () => new Client(node, apiKey) }));
  let failed = 0;
  try {
    // 1 · registration, through the screen.
    await settle();
    await until(app, /Operator/);
    await typeUntil(app, "Аня", /Аня/);
    await type(app, DOWN);
    await typeUntil(app, "27", /27/);
    await type(app, DOWN, ENTER);
    // The PIN twice, then the paper code: read off the screen, the way a
    // person reads it, and its second and fourth groups typed back.
    await until(app, /Ваш ПИН/);
    await typeUntil(app, "482913", /••••••/);
    await type(app, DOWN);
    await typeUntil(app, "482913", /••••••[\s\S]*••••••/);
    await type(app, DOWN, ENTER);
    await until(app, /Запишите этот код/);
    const paper = /([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4})/.exec(app.lastFrame() ?? "");
    assert.ok(paper, "the paper code is not on the screen in four groups");
    // With the cursor after it: the group itself is on the screen already, in
    // the code, and matched with no key landing (verifier, 2026-09-26).
    await typeUntil(app, paper[2], new RegExp(`${paper[2]}_`));
    await type(app, DOWN);
    await typeUntil(app, paper[4], new RegExp(`${paper[4]}_`));
    await type(app, DOWN, ENTER);
    await until(app, /Где ты/);
    out("ok   registration went through the screens, the PIN and the paper code");

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
    await peer.register({ name: "Марк", age: 29 }, { pin: "123456", paperCode: newPaperCode() });
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

    // Setting a table from the feed (C2): the defaults — dots 4x4, two seats,
    // no name — straight into the live table, a row in tables, and standing
    // up (the last action of the row) back to the feed.
    await pickInFeed(app, "table");
    await until(app, /поставить стол/);
    await type(app, DOWN, DOWN, DOWN, DOWN, ENTER);
    await until(app, /стол · dots/, 20);
    assert.match(app.lastFrame() ?? "", /без сквозного шифрования/, "the live table does not say it is open to the node");
    await rowAppears(sql, `SELECT 1 FROM tables WHERE game = 'dots' AND set = '4x4' AND seats = 2 AND created_at > now() - interval '5 minutes'`, []);
    for (let i = 0; i < 8; i++) await type(app, RIGHT);
    await type(app, ENTER);
    await until(app, /пробежку/, 20);
    out("ok   a table set from the feed opened live, stood in the database, and standing up led back to the feed");

    // Sitting down at a neighbour's table from the feed (C2, G1h): a table
    // card goes after every third phrase, so two more of Марк's go in — older,
    // so «пробежку» stays first for the steps below — and Марк sets a table.
    for (const text of ["кто на каток", "ищу компанию в кино"]) {
      await sql.unsafe(
        `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
           lat_published, lon_published, visible_at, expires_at, created_at)
         VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 59.9343, 30.3351, 1000,
           59.9343, 30.3351, now() - interval '1 hour', now() + interval '3 hours', now() - interval '1 hour')`,
        [crypto.randomUUID(), peer.identityId, text],
      );
    }
    const peerTable = await new Tables(peer).create({ class: "dots", set: "3x3", seats: 2, lat: 59.9343, lon: 30.3351, area_radius: 1000 });
    assert.equal(peerTable.status, 201, `Марк could not set a table: ${JSON.stringify(peerTable.body)}`);
    await pickInFeed(app, "point");
    await until(app, /Где ты/);
    await type(app, DOWN, DOWN, DOWN, ENTER);
    await until(app, /свободно 1/, 30);
    // The list wraps and the card's place depends on the page: walk to it by
    // the frame, not by a count.
    for (let i = 0; i < 6 && !/› стол/.test(app.lastFrame() ?? ""); i++) await type(app, DOWN);
    await until(app, /› стол/, 10);
    await pickInFeed(app, "open");
    await until(app, /стол · dots/, 20);
    assert.match(app.lastFrame() ?? "", /Марк/, "the table sat down at is not Марк's");
    await rowAppears(sql, `SELECT 1 FROM table_seats WHERE table_id = $1 AND left_at IS NULL GROUP BY table_id HAVING count(*) = 2`, [peerTable.body.id]);
    for (let i = 0; i < 8; i++) await type(app, RIGHT);
    await type(app, ENTER);
    await until(app, /пробежку/, 20);
    for (let i = 0; i < 6 && !/›[^\n]*\n\s*кто на пробежку/.test(app.lastFrame() ?? ""); i++) await type(app, UP);
    await until(app, /›[^\n]*\n\s*кто на пробежку/, 10);
    out("ok   a neighbour's table came in the feed, and sitting down from the row seated the person at it");

    // Hiding from the row, and back from the hidden list: the person's own
    // feed only, and reversible (§8.9).
    await pickInFeed(app, "hide");
    // Gone from the screen once the node took the hide; until then it stays.
    await until(app, /^(?![\s\S]*пробежку)/);
    // "me" now holds the lists (§4.11): name, age, liked, hidden.
    await pickInFeed(app, "me");
    await until(app, /скрытое · 1/, 20);
    await type(app, DOWN, DOWN, DOWN, ENTER);
    await until(app, /пробежку/, 20);
    await type(app, DOWN, ENTER); // bring it back
    await until(app, /ничего не скрыто/);
    await type(app, RIGHT, ENTER); // the hidden list: back to "me"
    await until(app, /скрытое/, 20);
    await type(app, RIGHT, ENTER); // "me": back to the feed
    await until(app, /пробежку/, 20);
    out("ok   a phrase hidden from the feed came back from the hidden list");

    // VF3 · the complaint through the App itself (app.ts case "complaint"):
    // an offer card at this point, "complain" on its row, the complaint
    // screen. The offer and its ten neighbours go in as rows (one offer per ten
    // phrases, routes/feed.ts) and out again, so the steps after see the feed
    // they saw before.
    {
      const advertiser = crypto.randomUUID(), venue = crypto.randomUUID(), offer = crypto.randomUUID();
      const filler = Array.from({ length: 10 }, () => crypto.randomUUID());
      await sql`INSERT INTO advertisers (id, email, contact) VALUES (${advertiser}, 'cafe-app@depth.test', 'кофейня')`;
      await sql`INSERT INTO venues (id, advertiser_id, name, address, verification_status, lat, lon, area_radius)
                VALUES (${venue}, ${advertiser}, 'Угол', 'ул. Реки 1', 'verified', 59.9343, 30.3351, 1000)`;
      await sql`INSERT INTO offers (id, brand, venue_id, offer_text, discount_value, redirect_code, discount_until, status, expires_at)
                VALUES (${offer}, 'sosed', ${venue}, 'чай за полцены', '-50%', ${"d" + offer.replaceAll("-", "")},
                        now() + interval '1 day', 'active', now() + interval '1 hour')`;
      for (const [i, id] of filler.entries()) {
        await sql.unsafe(
          `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
             lat_published, lon_published, visible_at, expires_at)
           VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 59.9343, 30.3351, 1000, 59.9343, 30.3351, now(), now() + interval '3 hours')`,
          [id, peer.identityId, `соседская фраза ${i}`],
        );
      }
      const refresh = async (what: RegExp) => {
        await pickInFeed(app, "point");
        await until(app, /Где ты/);
        await type(app, DOWN, DOWN, DOWN, ENTER);
        await until(app, what, 30);
      };
      await refresh(/чай за полцены/);
      for (let i = 0; i < 20 && !/›[^\n]*\n\s*чай за полцены/.test(app.lastFrame() ?? ""); i++) await type(app, DOWN);
      await until(app, /›[^\n]*\n\s*чай за полцены/, 10);
      await pickInFeed(app, "complain");
      await until(app, /скидку не дали/, 10);
      out("ok   \"complain\" on an offer's row in the App opened the complaint screen");
      // Fields, then the actions: send, back.
      await type(app, DOWN, DOWN, RIGHT, ENTER);
      await until(app, /чай за полцены/, 10);
      await sql`DELETE FROM feed_messages WHERE id = ANY(${filler})`;
      await sql`DELETE FROM offers WHERE id = ${offer}`;
      await refresh(/пробежку/);
      for (let i = 0; i < 6 && !/›[^\n]*\n\s*кто на пробежку/.test(app.lastFrame() ?? ""); i++) await type(app, UP);
      await until(app, /›[^\n]*\n\s*кто на пробежку/, 10);
    }

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
    await rowAppears(sql, `SELECT 1 FROM likes WHERE feed_message_id = $1`, [phraseId]);
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
    // What only the chat draws: "Марк" is on the inbox's row too, and waiting
    // for it let the next keys go to the inbox before the chat was up (B9,
    // 6 of 10 runs under stress, 26.09.2026).
    await until(app, /истории на диске нет/, 30);
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
    await until(app, /^(?![\s\S]*\d{4} \d{4} \d{4} \d{4} \d{4})/);
    await type(app, RIGHT, ENTER);
    await until(app, /гаснет после 4:20/, 20);
    const [mine] = await sql`SELECT p.idle_ttl_minutes AS span FROM chat_participants p
                              JOIN identities i ON i.id = p.identity
                             WHERE p.chat_id = ${peerChat.chat_id} AND i.name = 'Аня'`;
    assert.equal(Number(mine?.span), 260, "the span changed on the screen but not on the node");
    out("ok   the chat's own span went to the node");

    // 7b · the key reissue against the node (§8.13, T18): Марк asks for new
    // keys, the screen is shown the question and agrees from the row's last
    // action ("согласиться на новые ключи"); both halves then stand at epoch 1
    // on the node, and Марк's line sealed with the new keys opens on the screen.
    const rekeyChat = peerChat.chat_id as string;
    assert.equal((await peer.requestRekey(rekeyChat)).status, 200, "the other side could not ask for new keys");
    await until(app, /Собеседник просит новые ключи беседы/, 20);
    for (let i = 0; i < 10; i++) await type(app, RIGHT);
    await type(app, ENTER);
    await until(app, /Ключи беседы обновлены \(эпоха 1\)/, 20);
    const epochs = await sql`SELECT key_epoch FROM chat_participants WHERE chat_id = ${rekeyChat} ORDER BY key_epoch`;
    assert.deepEqual(epochs.map((r) => Number(r.key_epoch)), [1, 1], "the agreement on the screen did not bring both halves to epoch 1");
    assert.equal((await peer.sayInChat(rekeyChat, "после новых ключей", back.body.match_id!)).status, 202, "the other side's line after the reissue was refused");
    await until(app, /Марк: после новых ключей/, 20);
    assert.doesNotMatch(app.lastFrame() ?? "", /сообщение не открылось/, "a line after the reissue did not open on the screen");
    // Shown, so confirmed (§8.8; W14-RC): the node's queue lets the line go.
    // Until now depth never confirmed, and the queue kept every line until
    // its end (chat_RU.md :2339).
    for (let i = 0; i < 50; i++) {
      const [left] = await sql`SELECT count(*)::int AS n FROM pending_deliveries WHERE chat = ${rekeyChat}`;
      if (Number(left?.n) === 0) break;
      await settle(100);
    }
    const [queued] = await sql`SELECT count(*)::int AS n FROM pending_deliveries WHERE chat = ${rekeyChat}`;
    assert.equal(Number(queued?.n), 0, "the line shown on the screen is still in the node's queue — the terminal did not confirm receipt");
    out("ok   a line shown in the terminal was confirmed, and the node's queue let it go");
    out("ok   new keys: the other side asked, the screen agreed, and a line under the new keys opened");

    // 7c · "you missed a message" (§8.8, W13-DM): the screen leaves the room,
    // Марк writes while nobody is listening, and the queued copy is lost (as
    // §8.8 says it is when depth is not there to take it — here taken from
    // the node's queue by hand); back in the room the node's last activity is
    // after the last line this process saw, and the screen says so. The next
    // line from Марк takes the words off.
    // Walk the row by what the screen shows, not by a count: the cursor's
    // place after the reissue is the menu's business, not this test's.
    for (let i = 0; i < 10 && !/\[ назад \]/.test(app.lastFrame() ?? ""); i++) await type(app, LEFT);
    for (let i = 0; i < 10 && !/\[ назад \]/.test(app.lastFrame() ?? ""); i++) await type(app, RIGHT);
    assert.match(app.lastFrame() ?? "", /\[ назад \]/, "the row's \"back\" was not reached");
    await type(app, ENTER); // "назад"
    await until(app, /входящие/, 20);
    // The node's last activity is whole seconds (routes/inbox.ts), and so is
    // what the screen saw: a line in the same second as the last one seen is
    // not "later". The run was green only when the second happened to turn
    // (W13-DM2: red 2 of 2 on one machine, 1 of 2 on another) — so wait it out.
    await settle(1100);
    assert.equal((await peer.sayInChat(rekeyChat, "пока тебя не было", back.body.match_id!)).status, 202, "the line while away was refused");
    const dropped = await sql`DELETE FROM pending_deliveries WHERE chat = ${rekeyChat} RETURNING local_id`;
    assert.ok(dropped.length >= 1, "the line while away was not in the node's queue — nothing to lose");
    await type(app, ENTER);
    await until(app, /вы пропустили сообщение — попросите прислать снова/, 30);
    assert.doesNotMatch(app.lastFrame() ?? "", /Марк: пока тебя не было/, "a lost line came back from nowhere");
    assert.equal((await peer.sayInChat(rekeyChat, "снова здесь", back.body.match_id!)).status, 202);
    await until(app, /Марк: снова здесь/, 20);
    assert.doesNotMatch(app.lastFrame() ?? "", /вы пропустили сообщение/, "the words stayed after a new line arrived");
    out("ok   a line missed while the room was closed is said on return, and the next line takes the words off");
    // The room opened afresh stands on the draft field; the steps below
    // expect the row of actions, as they found it before this block.
    await type(app, DOWN);

    // 7a · a game in the conversation against the node (GC2, V10): the other
    // side proposes dots 2x2, the proposal frame reaches the screen on the
    // chat's socket, the screen opens "игра" (last in the row) and accepts; the
    // proposer moves first, and the screen answers with the first free edge.
    const peerGames = new ChatGames(peer);
    const chatId = peerChat.chat_id as string;
    assert.equal((await peerGames.propose(chatId, "dots", "2x2")).status, 204, "the other side could not propose a game");
    await until(app, /вам предлагают игру/, 20);
    for (let i = 0; i < 7; i++) await type(app, LEFT);
    for (let i = 0; i < 6; i++) await type(app, RIGHT);
    await type(app, ENTER);
    await until(app, /вам предлагают: dots/, 20);
    await type(app, ENTER);
    await until(app, /ходит собеседник/, 20);
    const opened = await peerGames.view(chatId);
    assert.equal(opened.body.board?.turn, 1, "the accept from the screen did not start the game with the proposer's move");
    assert.equal((await peerGames.move(chatId, opened.body.board!.seq, { edge: "h:0:0" })).status, 200, "the other side's move was refused");
    await until(app, /ваш ход/, 20);
    await type(app, ENTER);
    let after = await peerGames.view(chatId);
    for (let i = 0; i < 50 && after.body.board?.turn !== 1; i++) {
      await settle(100);
      after = await peerGames.view(chatId);
    }
    const edges = (after.body.board?.state as { dots?: { edges: string[] } }).dots?.edges ?? [];
    assert.deepEqual(edges.slice().sort(), ["h:0:0", "h:0:1"], "the screen's move did not reach the node");
    out("ok   a game in the conversation: proposed by the other side, accepted and moved on the screen");

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
    // The name as the node has it, not the row's "…": enter on the name opens
    // nothing until the profile has come (B9, 1 of 10 under stress).
    await until(app, /имя  Аня/, 20);
    await type(app, ENTER);
    await until(app, /меняется на чистом счету/, 20);
    await type(app, ..."\u007F\u007F\u007F".split(""), ..."Анна".split(""), DOWN, ENTER);
    await until(app, /Анна/, 20);
    // The field shows the name before the node has it: asked, not assumed.
    await rowAppears(sql, `SELECT 1 FROM identities WHERE id = $1 AND name_pending IS NOT NULL`, [me.id]);
    const [named] = await sql`SELECT name_pending FROM identities WHERE id = ${me.id}`;
    assert.equal(named?.name_pending, "Анна", "the new name did not reach the node's queue");
    out("ok   a name edited from the screen went to the queue");

    // 11 · the PIN changed from "me" (after name, age, liked, hidden and step
    // away), against the node's own proof: the old PIN opens it, and the
    // next step is confirmed with the new one.
    await until(app, /сменить ПИН/, 20);
    await type(app, DOWN, DOWN, DOWN, DOWN, DOWN, ENTER);
    await until(app, /Смена ПИНа/, 20);
    await typeUntil(app, "482913", /••••••/);
    await type(app, DOWN);
    await typeUntil(app, "111111", /••••••[\s\S]*••••••/);
    await type(app, DOWN);
    await typeUntil(app, "111111", /••••••[\s\S]*••••••[\s\S]*••••••/);
    await type(app, DOWN, ENTER);
    await until(app, /ПИН сменён/, 20);
    out("ok   the PIN was changed from the screen with the old one");

    // 12 · start again, confirmed with the new PIN: the identity is closed on
    // the node and the terminal is back at the first screen as someone else.
    await type(app, ENTER);
    await until(app, /начать заново/, 20);
    // Nine rows down: the two of the paper code (B1) and the move (B2)
    // stand before it.
    await type(app, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, ENTER);
    await until(app, /исчезнет фраз: \d/, 20);
    await typeUntil(app, "111111", /••••••/);
    await type(app, DOWN, ENTER);
    await until(app, /Operator/, 20);
    const [gone] = await sql`SELECT closed_at IS NOT NULL AS closed FROM identities WHERE id = ${me.id}`;
    assert.equal(gone?.closed, true, "the screen started again and the node did not close the identity");
    out("ok   starting again closed the identity on the node and returned to the first screen");

    // 13 · B1 · `depth restore`: a clean terminal raises an identity by its
    // paper code, sets a new PIN, writes the new code down, and the old one
    // raises nobody after (§8.2).
    const lostCode = newPaperCode();
    const lost = new Client(node, apiKey);
    await lost.register({ name: "Лев", age: 33 }, { pin: "123456", paperCode: lostCode });
    await lost.confirmPaperCode();
    const [before] = await sql`SELECT recovery_auth_hash FROM identities WHERE id = ${lost.identityId}`;
    const raised = render(h(App, { say, client: new Client(node, apiKey), start: "restore" }));
    try {
      await until(raised, /Бумажный код/);
      // Lower case and dashes, the way it comes off the paper.
      const typed = lostCode.toLowerCase().replace(/(.{4})(?!$)/g, "$1-");
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
      await until(raised, /Где ты/, 30);
      const [after] = await sql`SELECT recovery_auth_hash FROM identities WHERE id = ${lost.identityId}`;
      assert.notEqual(after.recovery_auth_hash, before.recovery_auth_hash, "the screens raised the identity and the code on file did not change");
      const [old] = await sql`SELECT frozen_reason FROM sessions WHERE id = ${lost.sessionId}`;
      assert.equal(old.frozen_reason, "transfer", "the lost terminal's session is still live");
      assert.equal((await raise(new Client(node, apiKey), lostCode)).ok, false, "the old paper code still raises the identity");
      assert.equal((await raise(new Client(node, apiKey), fresh.slice(1).join(""))).ok, true, "the code on the screen raises nobody");
      out("ok   `depth restore` raised the identity by its code, set a PIN, and traded the code for the one shown");
    } finally {
      raised.unmount();
    }

    // 14 · B2 · an identity moved into this terminal: the code comes from another
    // device (the core), typed on the first screen; "it is me" is said there,
    // and this terminal sets its first PIN and reaches the point.
    const elsewhere = new Client(node, apiKey);
    await elsewhere.register({ name: "Лена", age: 31 }, { pin: "123456", paperCode: newPaperCode() }, { hold: HeldKey.hold });
    await elsewhere.confirmPaperCode();
    const leaving = await Departure.open(elsewhere, await elsewhere.pinProof("123456"));
    assert.ok(leaving instanceof Departure, "the other device could not open a transfer window");
    await type(app, DOWN, DOWN, RIGHT, ENTER);
    await until(app, /Перенос сюда/, 20);
    await typeUntil(app, leaving.code, new RegExp(leaving.code));
    await type(app, DOWN, ENTER);
    await until(app, /сверка\s+[0-9A-Z]{4}/, 30);
    assert.equal(await leaving.state(), "claimed", "the typed code did not reach the other device");
    assert.match(app.lastFrame()!, new RegExp(`сверка\\s+${leaving.check}`), "the two devices show different check characters");
    assert.equal((await leaving.approve()).status, 200, "\"it is me\" was refused");
    await until(app, /Личность здесь/, 30);
    await typeUntil(app, "246810", /••••••/);
    await type(app, DOWN);
    await typeUntil(app, "246810", /••••••[\s\S]*••••••/);
    await type(app, DOWN, ENTER);
    await until(app, /Где ты/, 20);
    const [arrived] = await sql`SELECT s.label, (SELECT count(*)::int FROM sessions f WHERE f.identity = s.identity AND f.frozen_reason = 'transfer') AS frozen
      FROM sessions s WHERE s.identity = ${elsewhere.identityId} AND s.frozen_at IS NULL`;
    assert.match(String(arrived?.label), /^depth, /, "the live session is not the one this terminal claimed");
    assert.equal(arrived?.frozen, 1, "the device the identity left is not frozen");
    out("ok   an identity moved into the terminal by its code, and the terminal set its first PIN");

    // 15 · B2 · and out again, from "me": the PIN, the code on the screen, another
    // device types it, the confirmation shows its check, "it is me" freezes
    // this terminal.
    await typeUntil(app, "59.9343", /59\.9343/);
    await type(app, DOWN);
    await typeUntil(app, "30.3351", /30\.3351/);
    await type(app, DOWN, DOWN, ENTER);
    await until(app, /signal/, 20);
    await pickInFeed(app, "me");
    // The profile first: keys pressed before it answers land on a list that
    // is about to be drawn again (measured 26.09.2026).
    await until(app, /имя  Лена/, 20);
    // name, age, liked, hidden, away, pin, the two of the paper code, move.
    await type(app, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, DOWN, ENTER);
    await until(app, /Перенос личности/, 20);
    await typeUntil(app, "246810", /••••••/);
    await type(app, DOWN, ENTER);
    await until(app, /[0-9A-Z]{3} - [0-9A-Z]{3} - [0-9A-Z]{3}/, 30);
    const moveCode = /([0-9A-Z]{3}) - ([0-9A-Z]{3}) - ([0-9A-Z]{3})/.exec(app.lastFrame() ?? "")!.slice(1).join("");
    const next = new Client(node, apiKey);
    const arriving = await Arrival.claim(next, moveCode, "Firefox, Linux");
    assert.ok(arriving instanceof Arrival, "the code on the screen was not accepted by the node");
    await until(app, /Устройство просит перенести личность/, 30);
    assert.match(app.lastFrame()!, /назвалось\s+Firefox, Linux/);
    assert.match(app.lastFrame()!, new RegExp(`сверка\\s+${arriving.check}`), "the confirmation shows another check");
    await type(app, ENTER);
    await until(app, /Личность переехала/, 30);
    assert.equal(await arriving.state(), "approved", "the confirmation said moved and the node did not move it");
    assert.equal(next.identityId, elsewhere.identityId);
    out("ok   the identity moved out of the terminal after \"it is me\" on the confirmation");
    // 14 · B19 · a step away met on the paper code's screens: the PIN of a
    // device raised by the code, and the trade of the code for a new one. The
    // node refuses both while away (vault/init by its guard, recovery/reissue
    // by itself); each screen says so and offers "вернуться" right there, and
    // the same action then goes through (depth.away.return).
    const awayCode = newPaperCode();
    const wandering = new Client(node, apiKey);
    await wandering.register({ name: "Вика", age: 33 }, { pin: "123456", paperCode: awayCode });
    await wandering.confirmPaperCode();
    const awayFor = async () =>
      void await sql`UPDATE identities SET stepped_away_until = now() + interval '20 minutes' WHERE id = ${wandering.identityId}`;
    const stillAway = async () =>
      (await sql`SELECT stepped_away_until > now() AS away FROM identities WHERE id = ${wandering.identityId}`)[0]?.away === true;
    await awayFor();
    const awayApp = render(h(App, { say, client: new Client(node, apiKey), start: "restore" }));
    try {
      await until(awayApp, /Бумажный код/);
      await typeUntil(awayApp, awayCode, new RegExp(awayCode.slice(-4)));
      await type(awayApp, DOWN, ENTER);
      // The PIN's screen: refused while away, and the way back is there.
      await until(awayApp, /Ваш ПИН/, 30);
      await typeUntil(awayApp, "975310", /••••••/);
      await type(awayApp, DOWN);
      await typeUntil(awayApp, "975310", /••••••[\s\S]*••••••/);
      await type(awayApp, DOWN, ENTER);
      await until(awayApp, /Вы отошли/, 30);
      await until(awayApp, /вернуться/, 5);
      await type(awayApp, RIGHT, ENTER); // "вернуться"
      await until(awayApp, /^(?![\s\S]*Вы отошли)/, 30);
      assert.equal(await stillAway(), false, "the PIN's screen said back and the node still has the identity away");
      await type(awayApp, LEFT, ENTER); // the same "дальше" again
      await until(awayApp, /Запишите этот код/, 30);
      out("ok   a step away on the PIN's screen is ended there, and the PIN then goes through");

      // The code's screen: away again before the trade is confirmed.
      const fresh = /([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4})/.exec(awayApp.lastFrame() ?? "");
      assert.ok(fresh, "the new paper code is not on the screen in four groups");
      await awayFor();
      await typeUntil(awayApp, fresh[2], new RegExp(`${fresh[2]}_`));
      await type(awayApp, DOWN);
      await typeUntil(awayApp, fresh[4], new RegExp(`${fresh[4]}_`));
      await type(awayApp, DOWN, ENTER);
      await until(awayApp, /Новый бумажный код[\s\S]*Вы отошли/, 30);
      await until(awayApp, /вернуться/, 5);
      await type(awayApp, DOWN, RIGHT, ENTER); // from the field to the row, "вернуться"
      await until(awayApp, /^(?![\s\S]*Вы отошли)/, 30);
      assert.equal(await stillAway(), false, "the code's screen said back and the node still has the identity away");
      // The trade again, from the code on paper now: the old one still stands.
      // Up into the field first — the cursor is still in the row — then down
      // and left to "дальше": "вернуться" has left the row.
      await type(awayApp, UP);
      await typeUntil(awayApp, awayCode, new RegExp(awayCode.slice(-4)));
      await type(awayApp, DOWN, LEFT, LEFT, ENTER);
      await until(awayApp, /Запишите этот код/, 30);
      const again = /([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4})/.exec(awayApp.lastFrame() ?? "");
      assert.ok(again, "the second new code is not on the screen");
      await typeUntil(awayApp, again[2], new RegExp(`${again[2]}_`));
      await type(awayApp, DOWN);
      await typeUntil(awayApp, again[4], new RegExp(`${again[4]}_`));
      await type(awayApp, DOWN, ENTER);
      await until(awayApp, /Где ты/, 30);
      out("ok   a step away on the code's screen is ended there, and the trade then goes through");
    } finally {
      awayApp.unmount();
    }

    // 15 · B18 · no point yet, and the way to the feed asked for: an identity
    // raised by its code whose new code the node refused (here, a step away)
    // goes back from the code's screen to "me" and on to the feed — which it
    // has never seen. The feed with no point read place.lat of undefined and
    // killed the process (verifier, B1); it must open the point instead
    // (depth.feed.nopoint.test).
    const pointless = newPaperCode();
    const drifter = new Client(node, apiKey);
    await drifter.register({ name: "Гена", age: 41 }, { pin: "123456", paperCode: pointless });
    await drifter.confirmPaperCode();
    const noPoint = render(h(App, { say, client: new Client(node, apiKey), start: "restore" }));
    try {
      await until(noPoint, /Бумажный код/);
      await typeUntil(noPoint, pointless, new RegExp(pointless.slice(-4)));
      await type(noPoint, DOWN, ENTER);
      await until(noPoint, /Ваш ПИН/, 30);
      await typeUntil(noPoint, "864200", /••••••/);
      await type(noPoint, DOWN);
      await typeUntil(noPoint, "864200", /••••••[\s\S]*••••••/);
      await type(noPoint, DOWN, ENTER);
      await until(noPoint, /Запишите этот код/, 30);
      const shownCode = /([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4}) - ([0-9A-Z]{4})/.exec(noPoint.lastFrame() ?? "");
      assert.ok(shownCode, "the new paper code is not on the screen in four groups");
      await sql`UPDATE identities SET stepped_away_until = now() + interval '20 minutes' WHERE id = ${drifter.identityId}`;
      await typeUntil(noPoint, shownCode[2], new RegExp(`${shownCode[2]}_`));
      await type(noPoint, DOWN);
      await typeUntil(noPoint, shownCode[4], new RegExp(`${shownCode[4]}_`));
      await type(noPoint, DOWN, ENTER);
      await until(noPoint, /Новый бумажный код[\s\S]*Вы отошли/, 30);
      // The code's row: "дальше", "вернуться", "назад" — back to "me".
      await type(noPoint, DOWN, RIGHT, RIGHT, ENTER);
      await until(noPoint, /открыть устройство бумажным кодом/, 20);
      await type(noPoint, RIGHT, ENTER); // "me": "назад", to the feed
      await until(noPoint, /Где ты/, 20);
      out("ok   with no point yet, the way to the feed opens the point, and the terminal stays up");
    } finally {
      noPoint.unmount();
    }

    // C4: deck and word played from the table's screen with real keys against
    // the live node — tab to the board, a card played and one drawn; a word
    // set and a letter named. Two people at their own TableRoom each.
    const joiner = async (name: string) => {
      const c = new Client(node, apiKey);
      await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
      await c.confirmPaperCode();
      return c;
    };
    const room = (c: Client, id: string) =>
      render(h(TableRoom, {
        say, tables: new Tables(c), open: (t: string) => openTable(c, t), tableId: id,
        onLeave: () => {}, onError: (m: string) => { throw new Error(m); },
      }));
    // The first key right after the table first shows is lost (the room is
    // still opening; verifier, 2026-09-27: 40 of 40 at once, 0 of 40 after
    // 50 ms) — a pause, and the node is read until it has changed.
    const ready = () => new Promise((done) => setTimeout(done, 300));
    const boardOf = async (c: Client, id: string) => (await new Tables(c).view(id)).body.board!;
    const untilBoard = async (c: Client, id: string, ok: (b: Awaited<ReturnType<typeof boardOf>>) => boolean) => {
      for (let i = 0; i < 40; i++) {
        const b = await boardOf(c, id);
        if (ok(b)) return b;
        await new Promise((done) => setTimeout(done, 100));
      }
      return boardOf(c, id);
    };
    const startGame = async (game: "deck" | "word") => {
      const a = await joiner("Вера"), b = await joiner("Олег");
      const id = (await new Tables(a).create({ class: game, set: game, seats: 2, lat: 55.1, lon: 37.1, area_radius: 1000 })).body.id;
      await new Tables(b).sit(id);
      await new Tables(b).say(id, { kind: "application", text: "сыграю" });
      await new Tables(a).propose(id, "rematch");
      const seatOf = async (c: Client) => (await new Tables(c).view(id)).body.seat;
      return { id, bySeat: { [await seatOf(a)]: a, [await seatOf(b)]: b } as Record<number, Client> };
    };
    {
      const { id, bySeat } = await startGame("deck");
      const turn = (await new Tables(bySeat[1]).view(id)).body.board!.turn!;
      const mover = room(bySeat[turn], id);
      await until(mover, /ваш ход/, 20);
      await ready();
      await type(mover, "\t", ENTER); // the board's first action: the first card of one's hand
      const afterPlay = await untilBoard(bySeat[turn], id, (b) => b.turn !== turn);
      assert.equal((afterPlay.state.deck as { played: string[] }).played.length >= 1 && afterPlay.turn !== turn, true, "the card from the screen was not played");
      mover.unmount();
      const other = room(bySeat[afterPlay.turn!], id);
      await until(other, /ваш ход/, 20);
      await ready();
      await type(other, "\t");
      for (let i = 0; i < 12; i++) await type(other, RIGHT); // the row stops at its end: «взять из колоды»
      await type(other, ENTER);
      const stock = (b: Awaited<ReturnType<typeof boardOf>>) => (b.state.deck as { stock: { count: number } }).stock.count;
      const afterDraw = await untilBoard(bySeat[1], id, (b) => stock(b) < stock(afterPlay));
      assert.equal(stock(afterDraw), stock(afterPlay) - 1, "the draw from the screen did not take a card from the stock");
      other.unmount();
      out("ok   deck from the table's screen: a card played from one's hand, then one drawn from the stock");
    }
    {
      const { id, bySeat } = await startGame("word");
      const setterSeat = ((await new Tables(bySeat[1]).view(id)).body.board!.state.word as { setter: number }).setter;
      const setter = room(bySeat[setterSeat], id);
      await until(setter, /загадать слово/, 20);
      await ready();
      await type(setter, "\t");
      await typeUntil(setter, "кот", /кот/);
      await type(setter, DOWN, ENTER);
      await until(setter, /ваше слово: кот/, 20);
      setter.unmount();
      const guesser = room(bySeat[setterSeat === 1 ? 2 : 1], id);
      await until(guesser, /_ _ _/, 20);
      await ready();
      await type(guesser, "\t");
      await typeUntil(guesser, "к", /буква[^\n]*к/);
      await type(guesser, DOWN, ENTER);
      await until(guesser, /к _ _/, 20);
      guesser.unmount();
      out("ok   word from the table's screen: the setter set a word, the guesser named a letter and saw it in the mask");
    }
    {
      // Seated elsewhere (C5, GC2): the node names the table one sits at, and
      // the screen stands up there and sits down here.
      const me = await joiner("Лена"), host = await joiner("Игорь");
      const mine = (await new Tables(me).create({ class: "dots", set: "2x2", seats: 2, lat: 55.2, lon: 37.2, area_radius: 1000 })).body.id;
      const theirs = (await new Tables(host).create({ class: "dots", set: "2x2", seats: 2, lat: 55.2, lon: 37.2, area_radius: 1000 })).body.id;
      const refused = await new Tables(me).sit(theirs);
      const error = (refused.body as { error?: { code?: string; table?: string } }).error;
      assert.deepEqual([refused.status, error?.code, error?.table], [409, "already_seated", mine], `the node did not name the table: ${JSON.stringify(refused.body)}`);
      let opened: string | null = null;
      const screen = render(h(SeatedElsewhere, {
        say, tables: new Tables(me), there: mine, here: theirs, onOpen: (id: string) => (opened = id), onBack: () => {},
        onError: (m: string) => { throw new Error(m); },
      }));
      await until(screen, /вы уже за столом/, 20);
      await ready();
      await type(screen, RIGHT, ENTER);
      for (let i = 0; i < 40 && opened === null; i++) await new Promise((done) => setTimeout(done, 100));
      assert.equal(opened, theirs, "the screen did not move the person to the new table");
      const seats = (await new Tables(host).view(theirs)).body.seats.map((s) => s.name).sort();
      assert.deepEqual(seats, ["Игорь", "Лена"], "the person is not at the new table");
      screen.unmount();
      out("ok   seated elsewhere: the node named the old table, and the screen stood up there and sat down here");
    }
    // V8 · a complaint about an offer, from the feed's card to a row on the
    // node: the offer and ten neighbours' phrases go in as rows (one offer per
    // ten phrases, routes/feed.ts), the person walks to the card and complains.
    {
      const advertiser = crypto.randomUUID(), venue = crypto.randomUUID(), offer = crypto.randomUUID();
      await sql`INSERT INTO advertisers (id, email, contact) VALUES (${advertiser}, 'cafe@depth.test', 'кофейня')`;
      await sql`INSERT INTO venues (id, advertiser_id, name, address, verification_status, lat, lon, area_radius)
                VALUES (${venue}, ${advertiser}, 'Угол', 'ул. Реки 1', 'verified', 48.1, 11.6, 1000)`;
      await sql`INSERT INTO offers (id, brand, venue_id, offer_text, discount_value, redirect_code, discount_until, status, expires_at)
                VALUES (${offer}, 'sosed', ${venue}, 'кофе за полцены', '-50%', ${"d" + offer.replaceAll("-", "")},
                        now() + interval '1 day', 'active', now() + interval '1 hour')`;
      const join = async (name: string) => {
        const c = new Client(node, apiKey);
        await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
        await c.confirmPaperCode();
        return c;
      };
      const author = await join("Костя");
      for (let i = 0; i < 10; i++) {
        await sql.unsafe(
          `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
             lat_published, lon_published, visible_at, expires_at)
           VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 48.1, 11.6, 1000, 48.1, 11.6, now(), now() + interval '3 hours')`,
          [crypto.randomUUID(), author.identityId, `фраза ${i}`],
        );
      }
      const person = await join("Вера");
      let complaining: string | null = null;
      const feedScreen = render(h(Feed, {
        say, client: person, place: { lat: 48.1, lon: 11.6, radius: 1000 },
        onWrite: () => {}, onInbox: () => {}, onPoint: () => {}, onMe: () => {},
        onError: (m: string) => out(`     feed error: ${m}`),
        onComplain: (id: string) => { complaining = id; },
      }));
      await until(feedScreen, /кофе за полцены/, 20);
      const items = (await person.feed({ lat: 48.1, lon: 11.6, radius: 1000 })).items as Array<{ kind?: string; id: string }>;
      const at = items.findIndex((i) => i.kind === "offer");
      assert.ok(at >= 0, "no offer card in the live feed");
      for (let i = 0; i < at; i++) await type(feedScreen, DOWN);
      await pickInFeed(feedScreen, "complain");
      assert.equal(complaining, offer, "complain on the offer card did not carry the offer's id");
      feedScreen.unmount();
      let back = false;
      const screen = render(h(Complaint, { say, client: person, offerId: complaining!, onBack: () => { back = true; } }));
      await until(screen, /скидку не дали/, 10);
      await type(screen, "vera@example.org", DOWN, "не дали скидку", DOWN, ENTER);
      await until(screen, /отправлено/, 20);
      await rowAppears(sql, `SELECT 1 FROM offer_complaints WHERE offer_id = $1 AND notifier_email = 'vera@example.org'`, [offer]);
      await type(screen, ENTER);
      assert.ok(back, "back from the sent complaint did not return");
      screen.unmount();
      out("ok   an offer card in the live feed led to the complaint, and the complaint landed on the node");
    }
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
