// Games in a chat of two (chat spec §6, screen 18; protocol §4.7; db/076).
//
// Propose or change a game, answer it, move, resign, play again, end it. The
// engine is the table's; the frames go to the conversation's rooms (NOTIFY
// chat_game, chat/relay.ts) and every move is announced as an unencrypted
// system line (sys {kind: move}). A move moves the mover's own term of the
// conversation (§8.6). Not built: confirming a new game ("I am here"), draw
// and undo.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { type Query, transaction } from "../lib/db.ts";
import { type Caller, callerOf, refuse } from "../lib/identity_guard.ts";
import { sha256hex, sunsetHeader } from "../lib/identity_auth.ts";
import { log } from "../lib/log.ts";
import { CLASSES } from "../lib/tables.ts";
import { startState, stepGame } from "../lib/tables_engine.ts";
import { type ChatGameRow, liveChat, lockChatGame, seatOf, TERM_SQL, viewOf } from "../lib/chat_games.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;
const notFound = () => refuse("not_found", "no such game here", 404);
const done = () => new Response(null, { status: 204, headers: sunsetHeader() });
const unavailable = (error: unknown) => {
  log("error", "chat game request failed", { error: String(error) });
  return refuse("unavailable", "the node cannot write right now", 503);
};
// A frame for every room of the chat, built per room (chat/relay.ts).
const tell = (run: Query, chatId: string, kind: "board" | "proposal") =>
  run(`SELECT pg_notify('chat_game', $1)`, [`${chatId}|${kind}`]);

async function inChat(
  req: Request,
  chatId: string,
  step: (run: Query, caller: Caller, other: string) => Promise<Response>,
): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!UUID.test(chatId)) return notFound();
  return await transaction(async (run) => {
    const live = await liveChat(run, chatId, caller.identityId);
    if (!live) return notFound();
    return await step(run, caller, live.other);
  }).catch(unavailable);
}

const classSet = (body: { class?: unknown; set?: unknown } | null) => {
  const klass = typeof body?.class === "string" && (CLASSES as readonly string[]).includes(body.class) ? body.class : null;
  const set = typeof body?.set === "string" && body.set.length >= 1 && body.set.length <= 40 ? body.set : null;
  return klass && set ? { klass, set } : null;
};

// POST /chats/:id/game — propose a game, or change the one being played.
async function propose(req: Request, chatId: string): Promise<Response> {
  const body = await readJson<{ class?: unknown; set?: unknown }>(req.clone());
  return await inChat(req, chatId, async (run, caller) => {
    const chosen = classSet(body);
    if (!chosen) return refuse("invalid_body", "class is one of the seven, set is its set", 400);
    const pending = JSON.stringify({ id: crypto.randomUUID(), kind: "game", class: chosen.klass, set: chosen.set, by: caller.identityId });
    await run(
      `INSERT INTO chat_games (chat_id, class, set, state, pending, expires_at)
       VALUES ($1, $2, $3, '{"order":[],"turn":null,"passes":{},"board":[]}'::jsonb, $4::text::jsonb, ${TERM_SQL})
       ON CONFLICT (chat_id) DO UPDATE SET pending = EXCLUDED.pending, updated_at = now()`,
      [chatId, chosen.klass, chosen.set, pending],
    );
    await tell(run, chatId, "proposal");
    return done();
  });
}

// Starts the game named, the proposer at seat 1.
async function start(run: Query, chatId: string, klass: string, set: string, first: string, second: string) {
  const state = { ...startState(klass, set, [1, 2]), players: [first, second] };
  await run(
    `UPDATE chat_games SET class = $2, set = $3, state = $4::text::jsonb, seq = seq + 1, pending = NULL,
                           over = false, last_move_hash = NULL, updated_at = now()
      WHERE chat_id = $1`,
    [chatId, klass, set, JSON.stringify(state)],
  );
  await tell(run, chatId, "board");
}

// POST /chats/:id/game/answer — {answer: accept | decline | counter, class, set}.
async function answer(req: Request, chatId: string): Promise<Response> {
  const body = await readJson<{ answer?: unknown; class?: unknown; set?: unknown }>(req.clone());
  return await inChat(req, chatId, async (run, caller) => {
    const row = await lockChatGame(run, chatId);
    const offer = row?.pending;
    if (!row || !offer || offer.kind !== "game" || offer.by === caller.identityId) {
      return refuse("refused", "there is no proposal of the other side to answer", 409);
    }
    if (body?.answer === "accept") {
      await start(run, chatId, offer.class!, offer.set!, offer.by, caller.identityId);
      return done();
    }
    if (body?.answer === "decline") {
      await run(`UPDATE chat_games SET pending = NULL, updated_at = now() WHERE chat_id = $1`, [chatId]);
      await tell(run, chatId, "proposal");
      return done();
    }
    if (body?.answer === "counter") {
      const chosen = classSet(body);
      if (!chosen) return refuse("invalid_body", "a counter names another class and set", 400);
      const pending = { id: crypto.randomUUID(), kind: "game", class: chosen.klass, set: chosen.set, by: caller.identityId };
      await run(`UPDATE chat_games SET pending = $2::text::jsonb, updated_at = now() WHERE chat_id = $1`, [chatId, JSON.stringify(pending)]);
      await tell(run, chatId, "proposal");
      return done();
    }
    return refuse("invalid_body", "answer is accept, decline or counter", 400);
  });
}

// GET /chats/:id/game — the position, whose turn and the score, as this side sees it.
async function look(req: Request, chatId: string): Promise<Response> {
  return await inChat(req, chatId, async (run, caller) => {
    const [row] = await run<ChatGameRow>(`SELECT * FROM chat_games WHERE chat_id = $1`, [chatId]);
    if (!row) return notFound();
    return json(viewOf(row, caller.identityId), 200, sunsetHeader());
  });
}

// POST /chats/:id/game/moves and /word — one move through the class's engine.
async function play(req: Request, chatId: string, wordOnly: boolean): Promise<Response> {
  const raw = await req.clone().text();
  let body: { seq?: unknown; move?: unknown; pass?: unknown; word?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch { /* refused below */ }
  return await inChat(req, chatId, async (run, caller) => {
    const row = await lockChatGame(run, chatId);
    if (!row || (row.state.players?.length ?? 0) !== 2) return refuse("not_your_turn", "no game is running", 409);
    if (row.over) return refuse("not_your_turn", "the game is over", 409);
    if (!body) return refuse("invalid_body", "the body is not json", 400);
    // The word of hangman is a move of its own route: {word} at the current version.
    const seq = wordOnly ? row.seq : body.seq;
    const move = wordOnly ? { word: body.word } : body.move;
    const pass = !wordOnly && body.pass === true;
    if (!Number.isInteger(seq)) return refuse("invalid_body", "seq is required", 400);
    if (!pass && (move === undefined || move === null || JSON.stringify(move).length > 1024)) {
      return refuse("illegal_move", "a move is a value up to 1 KiB", 409, { reason: "shape" });
    }
    const hash = await sha256hex(new TextEncoder().encode(raw));
    const seat = seatOf(row, caller.identityId)!;
    if (seq === row.seq - 1 && row.last_move_hash === hash) return json(viewOf(row, caller.identityId), 200, sunsetHeader());
    if (seq !== row.seq) return refuse("stale_seq", "the board has moved on", 409, { seq: row.seq });
    const s = row.state;
    if (s.turn === null || s.order[s.turn] !== seat) return refuse("not_your_turn", "not your turn", 409);
    const step = stepGame(s, row.set, move, pass, seat);
    if ("refused" in step) return refuse("illegal_move", "the move breaks the class's rules", 409, { reason: step.refused });
    s.board.push(pass ? { seat, pass: true } : { seat, move: step.shown });
    if (!step.again) s.turn = (s.turn + 1) % s.order.length;
    const score = { ...row.score };
    for (const scored of step.scores) score[scored.seat] = (score[scored.seat] ?? 0) + scored.points;
    // The move moves the mover's own term (§8.6), and the game's is the earlier of the two.
    await run(`UPDATE chat_participants SET last_own_message_at = now() WHERE chat_id = $1 AND identity = $2`,
      [chatId, caller.identityId]);
    const [after] = await run<ChatGameRow>(
      `UPDATE chat_games SET state = $2::text::jsonb, score = $3::text::jsonb, seq = seq + 1, last_move_hash = $4,
                             over = $5, updated_at = now(), expires_at = ${TERM_SQL}
        WHERE chat_id = $1 RETURNING *`,
      [chatId, JSON.stringify(s), JSON.stringify(score), hash, step.over],
    );
    await run(`SELECT pg_notify('chat_sys', $1)`, [`${chatId}|${JSON.stringify({ kind: "move", seat })}`]);
    await tell(run, chatId, "board");
    return json(viewOf(after, caller.identityId), wordOnly ? 202 : 200, sunsetHeader());
  });
}

// POST /chats/:id/game/proposals — {kind: rematch}; draw and undo are not built.
async function proposeAgain(req: Request, chatId: string): Promise<Response> {
  const body = await readJson<{ kind?: unknown }>(req.clone());
  return await inChat(req, chatId, async (run, caller) => {
    if (body?.kind !== "rematch") return refuse("invalid_body", "only rematch is built; draw and undo are not yet", 400);
    const row = await lockChatGame(run, chatId);
    if (!row || (row.state.players?.length ?? 0) !== 2) return refuse("refused", "no game to play again", 409);
    if (row.pending) return refuse("pending_exists", "a proposal is already open", 409);
    const id = crypto.randomUUID();
    await run(`UPDATE chat_games SET pending = $2::text::jsonb WHERE chat_id = $1`,
      [chatId, JSON.stringify({ id, kind: "rematch", by: caller.identityId })]);
    await tell(run, chatId, "proposal");
    return json({ id }, 201, sunsetHeader());
  });
}

// POST /chats/:id/game/proposals/:pid — accept or decline the other side's rematch.
async function answerAgain(req: Request, chatId: string, pid: string): Promise<Response> {
  const body = await readJson<{ answer?: unknown }>(req.clone());
  return await inChat(req, chatId, async (run, caller) => {
    const row = await lockChatGame(run, chatId);
    if (!row?.pending || row.pending.id !== pid || row.pending.by === caller.identityId) return notFound();
    if (body?.answer === "accept") {
      const players = row.state.players!;
      await start(run, chatId, row.class, row.set, players[0], players[1]);
      return done();
    }
    if (body?.answer === "decline") {
      await run(`UPDATE chat_games SET pending = NULL WHERE chat_id = $1`, [chatId]);
      await tell(run, chatId, "proposal");
      return done();
    }
    return refuse("invalid_body", "answer is accept or decline", 400);
  });
}

// POST /chats/:id/game/resign — a one-sided announcement: the game is over, no result.
async function resign(req: Request, chatId: string): Promise<Response> {
  return await inChat(req, chatId, async (run) => {
    const row = await lockChatGame(run, chatId);
    if (!row || row.over || (row.state.players?.length ?? 0) !== 2) return refuse("refused", "no game is running", 409);
    await run(`UPDATE chat_games SET over = true, seq = seq + 1, updated_at = now() WHERE chat_id = $1`, [chatId]);
    await tell(run, chatId, "board");
    return done();
  });
}

// DELETE /chats/:id/game — end it; the end of the chat takes it anyway.
async function end(req: Request, chatId: string): Promise<Response> {
  return await inChat(req, chatId, async (run) => {
    await run(`DELETE FROM chat_games WHERE chat_id = $1`, [chatId]);
    await tell(run, chatId, "board");
    return done();
  });
}

route("POST", "/chats/:id/game", (c) => propose(c.req, c.params.id));
route("GET", "/chats/:id/game", (c) => look(c.req, c.params.id));
route("DELETE", "/chats/:id/game", (c) => end(c.req, c.params.id));
route("POST", "/chats/:id/game/answer", (c) => answer(c.req, c.params.id));
route("POST", "/chats/:id/game/moves", (c) => play(c.req, c.params.id, false));
route("POST", "/chats/:id/game/word", (c) => play(c.req, c.params.id, true));
route("POST", "/chats/:id/game/proposals", (c) => proposeAgain(c.req, c.params.id));
route("POST", "/chats/:id/game/proposals/:pid", (c) => answerAgain(c.req, c.params.id, c.params.pid));
route("POST", "/chats/:id/game/resign", (c) => resign(c.req, c.params.id));
