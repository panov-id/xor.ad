// Step 8: tables — a game for a company (chat spec §6, §6.1; protocol §4.6).
//
// A table is not a group chat: it sits next to the feed, it is public, and the
// node sees the board and every line. A person sits at one table at a time;
// setting a table up seats its author and stands them up from the previous one
// in the same transaction. A table is answered only to a live seat — to anyone
// else it is the 404 of a table that does not exist (SEC-4).
//
// Built here: set up, look, sit, stand, speak, move and pass, and the first
// round opened by a `rematch` proposal, liking a table and resigning. Not yet: the socket
// ticket, confirming a new game, draw and undo, congratulating,
// kicking. Lines and the name pass the feed's first tier of rules: clean is
// public at once, flagged waits for the queue (which does not yet read tables).

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { type Query, transaction } from "../lib/db.ts";
import { type Caller, callerOf, refuse } from "../lib/identity_guard.ts";
import { base64urlToBytes, sha256hex, sunsetHeader } from "../lib/identity_auth.ts";
import { checkAll } from "../lib/rate_limit.ts";
import { log } from "../lib/log.ts";
import { newDots, playDots } from "../lib/tables_dots.ts";
import { readText, verdictMode } from "../lib/feed_verdict.ts";
import {
  applyOverdue,
  bandBetween,
  blockedEither,
  CLASSES,
  emptyState,
  type GameState,
  leaveTable,
  lockGame,
  MOVE_WINDOW_MS,
  RADII,
  resign,
  SEAT_LIMITS,
  STICKER_LIMITS,
  TABLE_CREATE_LIMITS,
} from "../lib/tables.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;
const STICKER = /^[a-z0-9_-]{1,40}$/;
const graphemes = (text: string) => [...new Intl.Segmenter().segment(text)].length;
const notFound = () => refuse("not_found", "no such table", 404);
const unavailable = (error: unknown) => {
  log("error", "table request failed", { error: String(error) });
  return refuse("unavailable", "the node cannot write right now", 503);
};

interface Seat {
  id: string;
  seat_no: number;
  joined_at: Date;
  playing: boolean;
}

// The caller's live seat at this table, with the table locked; null is the
// 404 whatever the reason — no table, closed, or not seated (SEC-4).
async function seatAt(run: Query, tableId: string, identity: string): Promise<Seat | null> {
  if (!UUID.test(tableId)) return null;
  const [table] = await run(`SELECT 1 FROM tables WHERE id = $1 AND closed_at IS NULL FOR UPDATE`, [tableId]);
  if (!table) return null;
  const [seat] = await run<Seat>(
    `SELECT id, seat_no, joined_at, playing_from IS NOT NULL AS playing FROM table_seats
      WHERE table_id = $1 AND identity = $2 AND left_at IS NULL`,
    [tableId, identity],
  );
  if (!seat) return null;
  await applyOverdue(run, tableId);
  return seat;
}

// A table request: the caller, then a transaction with the caller's live seat.
async function atTable(
  req: Request,
  tableId: string,
  step: (run: Query, caller: Caller, seat: Seat) => Promise<Response>,
): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  return await transaction(async (run) => {
    const seat = await seatAt(run, tableId, caller.identityId);
    if (!seat) return notFound();
    return await step(run, caller, seat);
  }).catch(unavailable);
}

const touch = (run: Query, tableId: string) =>
  run(`UPDATE tables SET last_move_at = now() WHERE id = $1`, [tableId]);

// The board as this seat may see it. No class here keeps a hand yet, so
// nothing is cut; when one does, this is the one place that cuts it (§6.1).
// The table's score by seat: it lives on the seat and outlasts games (§6.1,
// table_scores); only live seats — the one who left does not take it along.
async function scoreOf(run: Query, tableId: string): Promise<Record<string, number>> {
  const rows = await run<{ seat_no: number; points: number }>(
    `SELECT s.seat_no, sc.points FROM table_scores sc JOIN table_seats s ON s.id = sc.seat_id
      WHERE s.table_id = $1 AND s.left_at IS NULL`,
    [tableId],
  );
  return Object.fromEntries(rows.map((r) => [String(r.seat_no), r.points]));
}

function boardFor(
  game: { state: GameState; seq: number; pending: unknown; turn_due: Date | null } | null,
  score: Record<string, number> = {},
  over = false,
) {
  if (!game) return null;
  const s = game.state;
  // The contract's Board (docs/api/openapi.yaml): whose turn by seat, the
  // turn's term as expires_at; score by seat from table_scores.
  return {
    seq: game.seq,
    state: s.dots ? { order: s.order, moves: s.board, dots: s.dots } : { order: s.order, moves: s.board },
    turn: s.turn === null ? null : s.order[s.turn] ?? null,
    score,
    over,
    expires_at: game.turn_due ? Math.floor(new Date(game.turn_due).getTime() / 1000) : null,
    pending: game.pending ?? null,
  };
}

async function create(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  const nonce = typeof body.nonce === "string" ? base64urlToBytes(body.nonce) : null;
  if (!nonce || nonce.length !== 16) return refuse("invalid_body", "nonce must be 16 bytes, base64url", 400);
  const game = body.class ?? body.game;
  if (typeof game !== "string" || !(CLASSES as readonly string[]).includes(game)) {
    return refuse("invalid_body", "class must be one of the seven board classes", 400);
  }
  const set = typeof body.set === "string" && body.set.length >= 1 && body.set.length <= 40 ? body.set : null;
  const seats = Number.isInteger(body.seats) && (body.seats as number) >= 2 && (body.seats as number) <= 6
    ? body.seats as number
    : null;
  const lat = typeof body.lat === "number" && Math.abs(body.lat) <= 90 ? body.lat : null;
  const lon = typeof body.lon === "number" && Math.abs(body.lon) <= 180 ? body.lon : null;
  const radius = RADII.includes(body.area_radius as number) ? body.area_radius as number : null;
  if (set === null || seats === null || lat === null || lon === null || radius === null) {
    return refuse("invalid_body", "set, seats (2–6), lat, lon and area_radius are required", 400);
  }
  const name = body.name === undefined || body.name === null ? null : body.name;
  if (name !== null && (typeof name !== "string" || graphemes(name) < 1 || graphemes(name) > 24)) {
    return refuse("invalid_body", "name is up to 24 characters", 400);
  }
  // The first tier of the feed's rules reads the name too: clean is the name
  // at once, flagged waits in name_pending for the queue (§6.1, 17.09.2026).
  const cleanName = typeof name === "string" && verdictMode() === "rules" && readText(name).length === 0 ? name : null;

  return await transaction<Response>(async (run) => {
    // The nonce first: a repeat gets the table it made (protocol §2).
    const fresh = await run(
      `INSERT INTO nonces (session_id, nonce, route, status, response)
       VALUES ($1, $2, 'POST /tables', 200, 'null'::jsonb) ON CONFLICT DO NOTHING RETURNING nonce`,
      [caller.sessionId, nonce],
    );
    if (fresh.length === 0) {
      const [kept] = await run<{ route: string; response: unknown }>(
        `SELECT route, response FROM nonces WHERE session_id = $1 AND nonce = $2`,
        [caller.sessionId, nonce],
      );
      if (!kept || kept.route !== "POST /tables") {
        return refuse("invalid_body", "this nonce was used on another route", 409);
      }
      return json(kept.response, 201, sunsetHeader());
    }
    const allowed = checkAll(TABLE_CREATE_LIMITS, caller.identityId);
    if (!allowed.allowed) {
      return refuse("rate_limited", "too many tables this hour", 429, {}, {
        "retry-after": String(allowed.retryAfterSeconds),
      });
    }
    // Standing up from the previous table is the first step (§6.1).
    await leaveTable(run, caller.identityId);
    const [table] = await run<{ id: string }>(
      `INSERT INTO tables (brand, game, set, seats, name, name_pending, lat, lon, area_radius, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [caller.brand ?? "unattributed", game, set, seats, cleanName, cleanName === null ? name : null, lat, lon, radius, caller.identityId],
    );
    await run(
      `INSERT INTO table_seats (table_id, identity, seat_no, playing_from) VALUES ($1, $2, 1, now())`,
      [table.id, caller.identityId],
    );
    await run(`INSERT INTO table_games (table_id, class, state) VALUES ($1, $2, $3::text::jsonb)`, [table.id, game, JSON.stringify(emptyState())]);
    const answer = { id: table.id };
    await run(`UPDATE nonces SET response = $3::text::jsonb WHERE session_id = $1 AND nonce = $2`, [caller.sessionId, nonce, JSON.stringify(answer)]);
    return json(answer, 201, sunsetHeader());
  }).catch(unavailable);
}

async function look(req: Request, tableId: string): Promise<Response> {
  return await atTable(req, tableId, async (run, caller, seat) => {
    const [table] = await run<{ game: string; set: string; seats: number; name: string | null; like_count: number }>(
      `SELECT game, set, seats, name, like_count FROM tables WHERE id = $1`,
      [tableId],
    );
    const [counts] = await run<{ playing: number; watching: number }>(
      `SELECT count(*) FILTER (WHERE playing_from IS NOT NULL)::int AS playing,
              count(*) FILTER (WHERE playing_from IS NULL)::int AS watching
         FROM table_seats WHERE table_id = $1 AND left_at IS NULL`,
      [tableId],
    );
    // No running game: the last one, over, with its final score (screen 19 C).
    const running = await lockGame(run, tableId);
    const [last] = running ? [] : await run<{ state: GameState; seq: number; pending: unknown; turn_due: Date | null }>(
      `SELECT state, seq, pending, NULL::timestamptz AS turn_due FROM table_games
        WHERE table_id = $1 ORDER BY started_at DESC LIMIT 1`,
      [tableId],
    );
    // Who sits where, by seat and name — never the identity (§8.11).
    const seats = await run<{ seat: number; name: string; role: string }>(
      `SELECT s.seat_no AS seat, i.name,
              CASE WHEN s.playing_from IS NULL THEN 'watching' ELSE 'playing' END AS role
         FROM table_seats s JOIN identities i ON i.id = s.identity
        WHERE s.table_id = $1 AND s.left_at IS NULL ORDER BY s.seat_no`,
      [tableId],
    );
    // Lines from the moment of sitting down, and none of those the caller hid.
    const lines = await run<{ id: string; seat: number; kind: string; text: string | null; sticker: string | null; created_at: number }>(
      `SELECT l.id, l.seat_no AS seat, l.kind, l.text, l.sticker,
              floor(extract(epoch from l.created_at))::int AS created_at FROM table_lines l
        WHERE l.table_id = $1 AND l.visible_at IS NOT NULL AND l.created_at >= $2
          AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.identity = $3 AND h.table_line_id = l.id)
        ORDER BY l.created_at`,
      [tableId, seat.joined_at, caller.identityId],
    );
    return json({
      id: tableId,
      class: table.game,
      set: table.set,
      name: table.name,
      like_count: table.like_count,
      playing: counts.playing,
      watching: counts.watching,
      seat: seat.seat_no,
      is_playing: seat.playing,
      seats,
      board: boardFor(running ?? last ?? null, await scoreOf(run, tableId), !running && !!last),
      lines,
    }, 200, sunsetHeader());
  });
}

async function sit(req: Request, tableId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const allowed = checkAll(SEAT_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many attempts to sit this hour", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
  if (!UUID.test(tableId)) return notFound();
  const me = caller.identityId;
  return await transaction<Response>(async (run) => {
    const [table] = await run(`SELECT 1 FROM tables WHERE id = $1 AND closed_at IS NULL FOR UPDATE`, [tableId]);
    if (!table) return notFound();
    const [here] = await run<{ table_id: string; seat_no: number }>(
      `SELECT table_id, seat_no FROM table_seats WHERE identity = $1 AND left_at IS NULL`,
      [me],
    );
    if (here && here.table_id === tableId) return json({ seat: here.seat_no }, 200, sunsetHeader());
    if (here) return refuse("already_seated", "stand up from your table first", 409);
    // Bands each with each, and no block either way — one answer for both, so
    // the refusal is not an oracle (§6.1).
    const [bar] = await run(
      `SELECT 1 FROM table_seats s JOIN identities o ON o.id = s.identity JOIN identities me ON me.id = $2
        WHERE s.table_id = $1 AND s.left_at IS NULL
          AND (NOT ${bandBetween("me", "o")} OR ${blockedEither("me.id", "o.id")})
        LIMIT 1`,
      [tableId, me],
    );
    if (bar) return refuse("unavailable", "this table is not available", 409);
    const [seat] = await run<{ seat_no: number }>(
      `INSERT INTO table_seats (table_id, identity, seat_no)
       SELECT $1, $2, coalesce(max(seat_no), 0) + 1 FROM table_seats WHERE table_id = $1
       RETURNING seat_no`,
      [tableId, me],
    );
    return json({ seat: seat.seat_no }, 200, sunsetHeader());
  }).catch(unavailable);
}

async function stand(req: Request, tableId: string): Promise<Response> {
  return await atTable(req, tableId, async (run, caller) => {
    await leaveTable(run, caller.identityId);
    return new Response(null, { status: 204, headers: sunsetHeader() });
  });
}

async function speak(req: Request, tableId: string): Promise<Response> {
  const body = await readJson<{ kind?: unknown; text?: unknown; sticker?: unknown; seat?: unknown }>(req.clone());
  return await atTable(req, tableId, async (run, caller, seat) => {
    const kind = body?.kind;
    if (kind === "sticker") {
      if (typeof body?.sticker !== "string" || !STICKER.test(body.sticker)) {
        return refuse("invalid_body", "sticker must be a catalogue name", 400);
      }
      const allowed = checkAll(STICKER_LIMITS, caller.identityId);
      if (!allowed.allowed) {
        return refuse("rate_limited", "too many stickers this minute", 429, {}, {
          "retry-after": String(allowed.retryAfterSeconds),
        });
      }
      // Our own catalogue: no queue, shown at once (DATA-20).
      const [line] = await run<{ id: string }>(
        `INSERT INTO table_lines (brand, table_id, author_identity, sticker, seat_no, kind, visible_at)
         VALUES ($1, $2, $3, $4, $5, 'sticker', now()) RETURNING id`,
        [caller.brand ?? "unattributed", tableId, caller.identityId, body.sticker, seat.seat_no],
      );
      await touch(run, tableId);
      return json({ id: line.id }, 200, sunsetHeader());
    }
    if (kind !== "line" && kind !== "application" && kind !== "refusal") {
      return refuse("invalid_body", "kind is line, application, refusal or sticker", 400);
    }
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text || graphemes(text) > 128) return refuse("invalid_body", "text is 1 to 128 characters", 400);
    if (kind === "refusal" && !seat.playing) return refuse("refused", "only a player refuses", 409);
    // A refusal names the applicant's seat (db/070): an applicant of this round.
    const target = kind === "refusal" ? body?.seat : null;
    if (kind === "refusal") {
      if (!Number.isInteger(target)) return refuse("invalid_body", "a refusal names the applicant's seat", 400);
      const [applicant] = await run(
        `SELECT 1 FROM table_seats s JOIN table_lines l ON l.table_id = s.table_id AND l.author_identity = s.identity
          WHERE s.table_id = $1 AND s.seat_no = $2 AND s.left_at IS NULL AND s.playing_from IS NULL
            AND l.kind = 'application'
            AND l.created_at >= coalesce((SELECT max(started_at) FROM table_games WHERE table_id = $1), '-infinity')
          LIMIT 1`,
        [tableId, target],
      );
      if (!applicant) return refuse("refused", "that seat has not applied this round", 409);
    }
    if (kind === "application") {
      if (seat.playing) return refuse("refused", "you are already playing", 409);
      // One application per game: the game's start is the border (§6.1).
      const [already] = await run(
        `SELECT 1 FROM table_lines l WHERE l.table_id = $1 AND l.author_identity = $2 AND l.kind = 'application'
            AND l.created_at >= coalesce((SELECT max(started_at) FROM table_games WHERE table_id = $1), '-infinity')
          LIMIT 1`,
        [tableId, caller.identityId],
      );
      if (already) return refuse("refused", "one application per game", 409);
    }
    // The first tier of the feed's rules (§8.3, lib/feed_verdict.ts): a clean
    // line is public at once, a flagged one waits for the queue as a phrase does.
    const clean = verdictMode() === "rules" && readText(text).length === 0;
    const [line] = await run<{ id: string }>(
      `INSERT INTO table_lines (brand, table_id, author_identity, text, seat_no, kind, refuses_seat, visible_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8 THEN now() END) RETURNING id`,
      [caller.brand ?? "unattributed", tableId, caller.identityId, text, seat.seat_no, kind, target ?? null, clean],
    );
    await touch(run, tableId);
    return json({ id: line.id }, 202, sunsetHeader());
  });
}

async function move(req: Request, tableId: string): Promise<Response> {
  const raw = await req.clone().text();
  let body: { seq?: unknown; move?: unknown; pass?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch { /* refused below */ }
  return await atTable(req, tableId, async (run, _caller, seat) => {
    if (!body || !Number.isInteger(body.seq)) return refuse("invalid_body", "seq is required", 400);
    const pass = body.pass === true;
    if (!pass && (body.move === undefined || body.move === null || JSON.stringify(body.move).length > 1024)) {
      return refuse("illegal_move", "a move is a value up to 1 KiB", 409, { reason: "shape" });
    }
    const game = await lockGame(run, tableId);
    if (!game || game.state.turn === null) return refuse("not_your_turn", "no game is running", 409);
    const hash = await sha256hex(new TextEncoder().encode(raw));
    // The same body at the version it was made against answers the same board
    // (DATA-24, SEC-11); any other stale version is refused.
    const [last] = await run<{ last_move_hash: string | null }>(
      `SELECT last_move_hash FROM table_games WHERE id = $1`,
      [game.id],
    );
    if (body.seq === game.seq - 1 && last?.last_move_hash === hash) {
      return json({ board: boardFor(game) }, 200, sunsetHeader());
    }
    if (body.seq !== game.seq) return refuse("stale_seq", "the board has moved on", 409, { seq: game.seq });
    const s = game.state;
    const turn = game.state.turn!;
    if (!seat.playing || s.order[turn] !== seat.seat_no) return refuse("not_your_turn", "not your turn", 409);
    // The dots class is checked whole (lib/tables_dots.ts); a closed box
    // scores on the seat and the closer moves again.
    let again = false;
    let over = false;
    if (!pass && s.dots) {
      const played = playDots(s.dots, body.move, seat.seat_no);
      if ("refused" in played) return refuse("illegal_move", "the move breaks the class's rules", 409, { reason: played.refused });
      again = played.closed > 0;
      over = played.over;
      if (played.closed > 0) {
        await run(
          `INSERT INTO table_scores (seat_id, points) VALUES ($1, $2)
           ON CONFLICT (seat_id) DO UPDATE SET points = table_scores.points + $2, updated_at = now()`,
          [seat.id, played.closed],
        );
      }
    }
    s.board.push(pass ? { seat: seat.seat_no, pass: true } : { seat: seat.seat_no, move: body.move });
    if (pass) s.passes[seat.seat_no] = (s.passes[seat.seat_no] ?? 0) + 1;
    else delete s.passes[seat.seat_no];
    if (!again) s.turn = (turn + 1) % s.order.length;
    const due = over ? null : new Date(Date.now() + MOVE_WINDOW_MS);
    const [after] = await run<{ seq: number }>(
      `UPDATE table_games SET state = $2::text::jsonb, seq = seq + 1, last_move_hash = $3, turn_due = $4,
              ended_at = CASE WHEN $5 THEN now() END
        WHERE id = $1 RETURNING seq`,
      [game.id, JSON.stringify(s), hash, due, over],
    );
    // The move in words, seen by everyone seated (§6, 09.09.2026); the engine
    // writes it, so it needs no queue.
    await run(
      `INSERT INTO table_lines (brand, table_id, author_identity, text, seat_no, kind, visible_at)
       SELECT brand, id, NULL, $2, $3, 'move', now() FROM tables WHERE id = $1`,
      [tableId, pass ? `seat ${seat.seat_no} passed` : `seat ${seat.seat_no} moved`, seat.seat_no],
    );
    await touch(run, tableId);
    return json(
      { board: boardFor({ ...game, seq: after.seq, turn_due: due }, await scoreOf(run, tableId), over) },
      200,
      sunsetHeader(),
    );
  });
}

// A new round: applicants take the free places in the order they applied
// (§6.1, "silence admits by the number of places"), the running game ends,
// and a fresh one starts with the players in seat order.
async function startRound(run: Query, tableId: string): Promise<void> {
  const [table] = await run<{ game: string; set: string; seats: number }>(
    `SELECT game, set, seats FROM tables WHERE id = $1`,
    [tableId],
  );
  const running = await lockGame(run, tableId);
  const since = running
    ? (await run<{ started_at: Date }>(`SELECT started_at FROM table_games WHERE id = $1`, [running.id]))[0].started_at
    : new Date(0);
  if (running) await run(`UPDATE table_games SET ended_at = now(), turn_due = NULL WHERE id = $1`, [running.id]);
  await run(
    `UPDATE table_seats s SET playing_from = now() WHERE s.id IN (
       SELECT s2.id FROM table_seats s2
         JOIN LATERAL (SELECT min(l.created_at) AS at FROM table_lines l
                        WHERE l.table_id = s2.table_id AND l.author_identity = s2.identity
                          AND l.kind = 'application' AND l.created_at >= $3) a ON a.at IS NOT NULL
        WHERE s2.table_id = $1 AND s2.left_at IS NULL AND s2.playing_from IS NULL
          -- Refused in words by a player this round: waits for the next (§6.1).
          AND NOT EXISTS (SELECT 1 FROM table_lines r WHERE r.table_id = $1 AND r.kind = 'refusal'
                             AND r.refuses_seat = s2.seat_no AND r.created_at >= $3)
        ORDER BY a.at
        LIMIT greatest(0, $2 - (SELECT count(*) FROM table_seats
                                 WHERE table_id = $1 AND left_at IS NULL AND playing_from IS NOT NULL)))`,
    [tableId, table.seats, since],
  );
  const players = await run<{ seat_no: number }>(
    `SELECT seat_no FROM table_seats WHERE table_id = $1 AND left_at IS NULL AND playing_from IS NOT NULL
      ORDER BY seat_no LIMIT $2`,
    [tableId, table.seats],
  );
  const state: GameState = { ...emptyState(), order: players.map((p) => p.seat_no) };
  if (table.game === "dots") state.dots = newDots(table.set);
  const playable = state.order.length >= 2;
  if (playable) state.turn = 0;
  await run(
    `INSERT INTO table_games (table_id, class, state, turn_due, ended_at) VALUES ($1, $2, $3::text::jsonb, $4, $5)`,
    [tableId, table.game, JSON.stringify(state), playable ? new Date(Date.now() + MOVE_WINDOW_MS) : null, playable ? null : new Date()],
  );
  await touch(run, tableId);
}

async function propose(req: Request, tableId: string): Promise<Response> {
  const body = await readJson<{ kind?: unknown }>(req.clone());
  return await atTable(req, tableId, async (run, _caller, seat) => {
    if (!seat.playing) return refuse("refused", "only a player proposes", 409);
    if (body?.kind !== "rematch") {
      return refuse("invalid_body", "only rematch is built; draw and undo are not yet", 400);
    }
    const game = await lockGame(run, tableId);
    if (game?.pending) return refuse("pending_exists", "a proposal is already open", 409);
    const id = crypto.randomUUID();
    const [{ count }] = await run<{ count: number }>(
      `SELECT count(*)::int AS count FROM table_seats WHERE table_id = $1 AND left_at IS NULL AND playing_from IS NOT NULL`,
      [tableId],
    );
    // Alone at the table there is nobody to ask: the round starts.
    if (count <= 1) {
      await startRound(run, tableId);
      return json({ id }, 200, sunsetHeader());
    }
    const pending = { id, kind: "rematch", by: seat.seat_no, answers: { [seat.seat_no]: "accept" } };
    if (game) await run(`UPDATE table_games SET pending = $2::text::jsonb WHERE id = $1`, [game.id, JSON.stringify(pending)]);
    else {
      const [t] = await run<{ game: string }>(`SELECT game FROM tables WHERE id = $1`, [tableId]);
      await run(
        `INSERT INTO table_games (table_id, class, state, pending) VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
        [tableId, t.game, JSON.stringify(emptyState()), JSON.stringify(pending)],
      );
    }
    return json({ id }, 200, sunsetHeader());
  });
}

async function answer(req: Request, tableId: string, pid: string): Promise<Response> {
  const body = await readJson<{ answer?: unknown }>(req.clone());
  return await atTable(req, tableId, async (run, _caller, seat) => {
    if (!seat.playing) return refuse("refused", "only a player answers", 409);
    const game = await lockGame(run, tableId);
    const pending = game?.pending as { id: string; answers: Record<string, string> } | null;
    if (!game || !pending || pending.id !== pid) return refuse("not_found", "no such proposal", 404);
    if (body?.answer === "decline") {
      await run(`UPDATE table_games SET pending = NULL WHERE id = $1`, [game.id]);
      return json({ state: "declined" }, 200, sunsetHeader());
    }
    if (body?.answer !== "accept") return refuse("invalid_body", "answer is accept or decline", 400);
    pending.answers[seat.seat_no] = "accept";
    const players = await run<{ seat_no: number }>(
      `SELECT seat_no FROM table_seats WHERE table_id = $1 AND left_at IS NULL AND playing_from IS NOT NULL`,
      [tableId],
    );
    if (players.every((p) => pending.answers[p.seat_no] === "accept")) {
      await run(`UPDATE table_games SET pending = NULL WHERE id = $1`, [game.id]);
      await startRound(run, tableId);
      return json({ state: "started" }, 200, sunsetHeader());
    }
    await run(`UPDATE table_games SET pending = $2::text::jsonb WHERE id = $1`, [game.id, JSON.stringify(pending)]);
    return json({ state: "waiting" }, 200, sunsetHeader());
  });
}

// Liking a table without sitting (§6.1, 17.09.2026): only a table the caller
// could sit at — open, someone seated, bands each with each, no block either
// way; anything else is the 404 of a table that does not exist.
async function like(req: Request, tableId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!UUID.test(tableId)) return notFound();
  const me = caller.identityId;
  return await transaction<Response>(async (run) => {
    const [open] = await run(
      `SELECT 1 FROM tables t WHERE t.id = $1 AND t.closed_at IS NULL
          AND EXISTS (SELECT 1 FROM table_seats s WHERE s.table_id = t.id AND s.left_at IS NULL)
          AND NOT EXISTS (SELECT 1 FROM table_seats s JOIN identities o ON o.id = s.identity JOIN identities me ON me.id = $2
                           WHERE s.table_id = t.id AND s.left_at IS NULL
                             AND (NOT ${bandBetween("me", "o")} OR ${blockedEither("me.id", "o.id")}))
        FOR UPDATE OF t`,
      [tableId, me],
    );
    if (!open) return notFound();
    const added = await run(
      `INSERT INTO table_likes (table_id, identity) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`,
      [tableId, me],
    );
    if (added.length > 0) await run(`UPDATE tables SET like_count = like_count + 1 WHERE id = $1`, [tableId]);
    return json({ state: "liked" }, 200, sunsetHeader());
  }).catch(unavailable);
}

async function unlike(req: Request, tableId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (UUID.test(tableId)) {
    const done = await transaction(async (run) => {
      const gone = await run(`DELETE FROM table_likes WHERE table_id = $1 AND identity = $2 RETURNING 1`, [
        tableId,
        caller.identityId,
      ]);
      if (gone.length > 0) await run(`UPDATE tables SET like_count = like_count - 1 WHERE id = $1`, [tableId]);
      return true;
    }).catch((error) => unavailable(error));
    if (done instanceof Response) return done;
  }
  return new Response(null, { status: 204, headers: sunsetHeader() });
}

async function giveUp(req: Request, tableId: string): Promise<Response> {
  return await atTable(req, tableId, async (run, _caller, seat) => {
    if (!seat.playing) return refuse("refused", "only a player resigns", 409);
    await resign(run, tableId, seat.seat_no);
    await run(
      `INSERT INTO table_lines (brand, table_id, author_identity, text, seat_no, kind, visible_at)
       SELECT brand, id, NULL, $2, $3, 'move', now() FROM tables WHERE id = $1`,
      [tableId, `seat ${seat.seat_no} resigned`, seat.seat_no],
    );
    await touch(run, tableId);
    return new Response(null, { status: 204, headers: sunsetHeader() });
  });
}

route("POST", "/tables", (c) => create(c.req));
route("POST", "/tables/:id/like", (c) => like(c.req, c.params.id));
route("DELETE", "/tables/:id/like", (c) => unlike(c.req, c.params.id));
route("POST", "/tables/:id/resign", (c) => giveUp(c.req, c.params.id));
route("GET", "/tables/:id", (c) => look(c.req, c.params.id));
route("POST", "/tables/:id/seat", (c) => sit(c.req, c.params.id));
route("DELETE", "/tables/:id/seat", (c) => stand(c.req, c.params.id));
route("POST", "/tables/:id/lines", (c) => speak(c.req, c.params.id));
route("POST", "/tables/:id/moves", (c) => move(c.req, c.params.id));
route("POST", "/tables/:id/proposals", (c) => propose(c.req, c.params.id));
route("POST", "/tables/:id/proposals/:pid", (c) => answer(c.req, c.params.id, c.params.pid));
