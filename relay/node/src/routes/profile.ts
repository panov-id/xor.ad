// PATCH /identities/me — the profile, edited (chat spec §8.2, §8.3; protocol
// §4.11). Any subset of {name, age, filter_age_min, filter_age_max, languages}.
//
// The name does not change here. It goes to name_pending and waits for the
// queue, where the moderator reads it beside the next phrase and the same
// verdict accepts both (§8.2, 2026-09-22); until then the old name stands.
// 202 says exactly that. And the accepted name is frozen while a phrase of
// yours lives or a chat is open — the person you are talking to was shown one
// name, and it does not change under them (§8.2, 2026-08-20/21). A rejected
// name is never frozen: it is the one thing you must be able to fix.
//
// Age moves freely inside its pool and across 20/21 only upward: an adult does
// not walk into the teenage sandbox (§8.2). The filter stays inside the band
// the node would compute anyway — a filter wider than the band would promise
// people the feed will never show.
//
// The row is locked for the whole edit: the verdict in lib/feed_verdict.ts
// reads name_pending under the same lock, so a change cannot slip between the
// moderator's read and the click (review panel 2026-09-22, data lens). Locks
// go in the verdict's order — identity_stats first, identities second — or
// the two deadlock on the same person (both lenses of the panel, 2026-09-22).

import { route } from "../lib/router.ts";
import { cleanName } from "../lib/names.ts";
import { json } from "../lib/http.ts";
import { transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { sunsetHeader } from "../lib/identity_auth.ts";
import { band } from "../lib/feed_geo.ts";
import { livePhraseOf, refusalFor } from "../lib/feed_limits.ts";
import { TERM_PASSED } from "../lib/chat_sweeper.ts";
import { checkAll, PROFILE_PATCH_LIMITS } from "../lib/rate_limit.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";
import { withoutAddresses } from "../lib/mailer.ts";
import postgres from "npm:postgres@3.4.4";

// limits.tsv name.length: 24 graphemes, and never more than 400 bytes.
const NAME_GRAPHEMES = 24;
const NAME_BYTES = 400;
const LANGUAGES_MAX = 3;
// No ceiling in the DDL (2026-08-28); this one keeps an integer overflow from
// reaching it as a 500 after the day's token was spent.
const AGE_MAX = 150;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const countGraphemes = (text: string): number => [...graphemes.segment(text)].length;

interface Row {
  name: string;
  name_pending: string | null;
  name_state: "accepted" | "pending" | "rejected";
  age: number;
  filter_age_min: number | null;
  filter_age_max: number | null;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

async function patchProfile(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  // Counted before anything is read: a refused edit is an edit attempted.
  const allowed = checkAll(PROFILE_PATCH_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many profile edits today", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return refuse("invalid_body", "a JSON object is expected", 400);
  const keys = ["name", "age", "filter_age_min", "filter_age_max", "languages"] as const;
  const given = keys.filter((k) => body[k] !== undefined);
  if (given.length === 0) return refuse("invalid_body", "nothing to change", 400);
  // In the contract since 2026-09-19, with no column to land in yet: said so
  // rather than dropped on the floor.
  if (body.filter_modes !== undefined) return refuse("invalid_body", "filter_modes is not built yet", 400);

  // Shape first, without the row: these answers do not depend on it.
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return refuse("invalid_body", "name must be a non-empty string", 400);
    }
    const wanted = cleanName(body.name);
    if (wanted === null) {
      return refuse("invalid_body", "name has characters nobody can see", 400);
    }
    if (countGraphemes(wanted) > NAME_GRAPHEMES || new TextEncoder().encode(wanted).length > NAME_BYTES) {
      return refuse("invalid_body", `name is at most ${NAME_GRAPHEMES} characters`, 400);
    }
    body.name = wanted;
  }
  if (body.age !== undefined && (!isInt(body.age) || body.age < 13 || body.age > AGE_MAX)) {
    return refuse("invalid_body", `age must be a whole number from 13 to ${AGE_MAX}`, 400);
  }
  // The same bounds as an age: a filter outside them filters nothing, and past
  // 2^31 it reached the integer column and came back a 503 (verifier on B90,
  // B98).
  for (const k of ["filter_age_min", "filter_age_max"] as const) {
    const v = body[k];
    if (v !== undefined && v !== null && (!isInt(v) || v < 13 || v > AGE_MAX)) {
      return refuse("invalid_body", `${k} must be a whole number from 13 to ${AGE_MAX} or null`, 400);
    }
  }
  if (body.languages !== undefined) {
    const l = body.languages;
    if (!Array.isArray(l) || l.length > LANGUAGES_MAX || !l.every((x) => typeof x === "string" && /^[a-z]{2,3}$/.test(x))) {
      return refuse("invalid_body", `languages is up to ${LANGUAGES_MAX} language codes`, 400);
    }
  }

  let patched: "name_queued" | "applied" | null = null;
  const answer = await transaction<Response>(async (run) => {
    // identity_stats first — the verdict's order — and it doubles as the
    // pause check for a new name below.
    const refusal = await refusalFor(run, caller.identityId);
    const [row] = await run<Row>(
      `SELECT name, name_pending, name_state, age, filter_age_min, filter_age_max
         FROM identities WHERE id = $1 AND closed_at IS NULL FOR UPDATE`,
      [caller.identityId],
    );
    if (!row) return refuse("unauthorized", "the request is not signed by a live session", 401);

    const age = body.age === undefined ? row.age : body.age as number;
    if (body.age !== undefined && row.age >= 21 && age <= 20) {
      return refuse("age_step_down", "age does not go back across 21", 409);
    }
    let min = body.filter_age_min === undefined ? row.filter_age_min : body.filter_age_min as number | null;
    let max = body.filter_age_max === undefined ? row.filter_age_max : body.filter_age_max as number | null;
    if (min !== null && max !== null && min > max) {
      return refuse("invalid_body", "filter_age_min is above filter_age_max", 400);
    }
    const b = band(age);
    const outside = (min !== null && (min < b.low || (b.high !== null && min > b.high))) ||
      (max !== null && (max < b.low || (b.high !== null && max > b.high)));
    if (outside) {
      if (body.filter_age_min === undefined && body.filter_age_max === undefined) {
        // The person changed their age, not the filter: the old filter is
        // clamped into the new band, as §8.2 says, rather than refused for
        // something they did not send (panel 2026-09-22).
        const clamp = (v: number) => Math.max(b.low, b.high === null ? v : Math.min(v, b.high));
        min = min === null ? null : clamp(min);
        max = max === null ? null : clamp(max);
      } else {
        return refuse("filter_out_of_band", `the filter stays inside ${b.low}–${b.high ?? "∞"}`, 409, {
          band_min: b.low, ...(b.high === null ? {} : { band_max: b.high }),
        });
      }
    }

    let nameQueued = false;
    if (body.name !== undefined) {
      const wanted = body.name as string;
      const already = row.name_state === "pending" ? row.name_pending === wanted : row.name === wanted;
      if (!already) {
        // Frozen in every state but rejected — §8.2 names the exception, not
        // the rule, and a pending name beside a live phrase would otherwise
        // change under a conversation (security lens, 2026-09-22).
        if (row.name_state !== "rejected") {
          // Frozen while a phrase of yours lives or a chat of yours is open.
          const [busy] = await run<{ phrase: boolean; chat: boolean }>(
            `SELECT EXISTS (SELECT 1 FROM feed_messages f
                             WHERE f.author_identity = $1 AND ${livePhraseOf("f")}) AS phrase,
                    EXISTS (SELECT 1 FROM chat_participants p JOIN chats c ON c.id = p.chat_id
                             WHERE p.identity = $1 AND p.gone_at IS NULL AND NOT (${TERM_PASSED})) AS chat`,
            [caller.identityId],
          );
          if (busy.phrase || busy.chat) {
            return refuse("name_frozen", busy.chat ? "the name is frozen while a chat is open" : "the name is frozen while a phrase lives", 409);
          }
        }
        // The same pause that stops a send stops a new name: both are text
        // for the queue (§8.3).
        if (refusal?.kind === "paused") {
          return refuse("paused", "too many refusals; the queue is paused", 429, {
            until: Math.floor(refusal.until.getTime() / 1000),
          }, { "retry-after": String(Math.max(1, Math.ceil((refusal.until.getTime() - Date.now()) / 1000))) });
        }
        await run(
          `UPDATE identities SET name_pending = $2, name_state = 'pending' WHERE id = $1`,
          [caller.identityId, wanted],
        );
        nameQueued = true;
      }
    }
    await run(
      `UPDATE identities
          SET age = $2, filter_age_min = $3, filter_age_max = $4,
              languages = coalesce($5::text[], languages)
        WHERE id = $1`,
      [caller.identityId, age, min, max, body.languages === undefined ? null : body.languages],
    );
    // §8.2: every open chat of this person hears a changed age, as a sys frame
    // {kind: age_changed, age} — the number, and no text: the client words it
    // in its own language (the owner's decision of 2026-09-22). In the same
    // transaction, so a rolled-back edit is never announced. A peer who is not
    // in the room sees the age in the inbox, where it already is.
    if (age !== row.age) {
      const open = await run<{ chat_id: string }>(
        `SELECT p.chat_id FROM chat_participants p JOIN chats c ON c.id = p.chat_id
          WHERE p.identity = $1 AND p.gone_at IS NULL AND NOT (${TERM_PASSED})`,
        [caller.identityId],
      );
      for (const { chat_id } of open) {
        await run(`SELECT pg_notify('chat_sys', $1)`, [`${chat_id}|${JSON.stringify({ kind: "age_changed", age })}`]);
      }
    }
    // Counted once the edit commits, below (B68).
    patched = nameQueued ? "name_queued" : "applied";
    // The profile as it now stands, the same shape GET gives (202 when the
    // name is still on its way, and name_pending says which).
    const [now] = await run<Row & { languages: string[]; stepped_away_until: Date | null }>(
      `SELECT name, name_pending, name_state, age, filter_age_min, filter_age_max, languages, stepped_away_until
         FROM identities WHERE id = $1`,
      [caller.identityId],
    );
    return json({
      name: now.name,
      ...(now.name_pending ? { name_pending: now.name_pending } : {}),
      name_state: now.name_state,
      age: now.age,
      ...(now.filter_age_min === null ? {} : { filter_age_min: now.filter_age_min }),
      ...(now.filter_age_max === null ? {} : { filter_age_max: now.filter_age_max }),
      languages: now.languages ?? [],
      ...(now.stepped_away_until ? { stepped_away_until: Math.floor(now.stepped_away_until.getTime() / 1000) } : {}),
    }, nameQueued ? 202 : 200, sunsetHeader());
  }).catch((error) => {
    // A 503 and a line, as every other write route answers a database that
    // could not take the edit; let out, it was a 500 with nothing logged
    // (review panel 5, D9, B90). Nothing is counted: the edit did not happen.
    //
    // Only the database's errors: a SQLSTATE or postgres.js's own connection
    // code, a string either way. A fault of this code has none and goes on to
    // dispatch, which answers 500 and logs it with the request's id (B98).
    // The line here is the route's and scrubbed as dispatch scrubs; the
    // request id is dispatch's alone, and its "request" line for this route
    // and a 503 is the one to pair it with.
    if (!fromTheDatabase(error)) throw error;
    log("error", "profile edit failed", {
      route: "PATCH /identities/me",
      code: (error as { code: string }).code,
      error: withoutAddresses(String(error)),
    });
    return null;
  });
  if (patched && answer) inc("relay_profile_patch_total", { result: patched });
  return answer ?? refuse("unavailable", "the node cannot answer right now", 503);
}

// An error the database or its driver raised: a SQLSTATE, or postgres.js's own
// connection code — a string either way. A fault of this code carries none.
//
// Narrowed to the database being unavailable, not wrong (verifier on B98,
// B105): any string code let a typo in SQL (42703), a bad cast (22P02),
// postgres.js's own UNDEFINED_VALUE and a Node error (ENOENT) through as a
// 503, when each is a fault of this code that dispatch should answer 500 and
// log with its request id. What stays is what a retry can outlive:
//   08 connection exception, 53 insufficient resources (disk, memory,
//   connections), 57 operator intervention (57014 statement timeout, 57P01
//   shutdown), 40 transaction rollback (40001 serialization, 40P01 deadlock),
//   55 object not in prerequisite state (55P03 lock timeout) — on a
//   PostgresError only;
//   and postgres.js's connection codes, raised as a plain Error: the
//   CONNECTION_* family, CONNECT_TIMEOUT, and the socket's ECONNREFUSED
//   (measured in postgres:16 / postgres.js 3.4.4, B105).
const UNAVAILABLE_CLASSES = new Set(["08", "53", "57", "40", "55"]);
const CONNECTION_CODES = new Set([
  "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED", "CONNECT_TIMEOUT", "ECONNREFUSED",
]);
export function fromTheDatabase(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return false;
  if (error instanceof postgres.PostgresError) return UNAVAILABLE_CLASSES.has(code.slice(0, 2));
  return CONNECTION_CODES.has(code);
}

route("PATCH", "/identities/me", (c) => patchProfile(c.req));
