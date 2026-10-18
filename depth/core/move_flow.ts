// The move's screen rules (chat spec §8.2, screen 13), for every face that draws a move: the web
// (web/src/api/transfer.ts, screens/Departure.tsx, logic/useArrival.ts), the terminal (depth/ink/move.ts)
// and the app shell (app/src/screens/Move*.tsx). The keys and the node's routes are transfer_move.ts;
// this is what the screens decide from them: which words end a move, what a refused claim says, when
// a code is complete, how long it lives, how the asking is paced, what "when" reads, and the name a
// browser gives itself.
//
// Moved out of the faces on 18.10.2026 so that the three say the same thing for the same answer.
// Pure: no React, no DOM, no clock of its own (the caller passes `now`).
// paper_text.ts, not paper.ts: the reading rule alone, without the paper code's argon2 (hash-wasm), so a face's
// unit tests run with no node_modules.
import { readPaperText } from "./paper_text.ts";
import type { MoveState } from "./transfer_move.ts";

/** The code's length on both screens (transfer.ts LENGTH): three groups of three. */
export const MOVE_CODE_LENGTH = 9;

/** What ends a move on either screen, in the terminal's words (depth/ink/locales *.json move.*). */
export const MOVE_ENDINGS: Partial<Record<MoveState, string>> = {
  rejected: "move.rejected",
  cancelled: "move.twice",
  expired: "move.expired",
  garbled: "move.garbled",
};

/** The dictionary key that ends a move in this state, or null while the move is still on. */
export const endingOf = (state: MoveState): string | null => MOVE_ENDINGS[state] ?? null;

/** A dictionary line: a key and the values it takes. */
export interface Words {
  key: string;
  values?: Record<string, string | number>;
}

/**
 * The node's refusal of a claim (POST /sessions/claim), in words: 404 is "does not match or has
 * expired", one wording for both; 409 the second claim that cancelled it; 429 the claim's own limit
 * (this address's allowance or the node's shared brake, §8.2 claim.miss.*), said as such and not in
 * the PIN's words (W12-C2). Anything else has no words here: null, and the face says the status.
 */
export function claimRefusal(answer: { status: number; retryAfter?: number | null }): Words | null {
  if (answer.status === 404) return { key: "move.codeBad" };
  if (answer.status === 409) return { key: "move.twice" };
  if (answer.status === 429) return { key: "restore.wait", values: { n: String(answer.retryAfter ?? "?") } };
  return null;
}

/** What was typed, read as a code (paper.ts readPaperText), and whether it is all of it. */
export function typedCode(typed: string): { clean: string; complete: boolean } {
  const clean = readPaperText(typed);
  return { clean, complete: clean.length === MOVE_CODE_LENGTH };
}

/** The seconds a code has left, from when it ends (ms) and now (ms): never below zero, whole seconds. */
export const secondsLeft = (endsAt: number, now: number): number => Math.max(0, Math.round((endsAt - now) / 1000));

/** "when" on the confirmation: under ten seconds is "just now", then the seconds (depth/ink move.ts MoveConfirm). */
export function seenWords(seenAt: number, now: number): Words {
  const seconds = Math.max(0, Math.round((now - seenAt) / 1000));
  return seconds < 10 ? { key: "move.justNow" } : { key: "move.secondsAgo", values: { n: seconds } };
}

/**
 * What the old device does with the state it was just told: an envelope this code does not open is
 * not somebody who typed it right — the code is killed at once rather than left to run out; approved
 * is moved, however the screen learned it (review panel 2026-09-26, F2).
 */
export function departureStep(next: MoveState): { kill: boolean; moved: boolean } {
  return { kill: next === "garbled", moved: next === "approved" };
}

/** The asks go on while the code waits or somebody has claimed it; any other state ends them. */
export const departureAsking = (state: MoveState): boolean => state === "waiting" || state === "claimed";

/** The new device asks only while its claim waits for the old device's answer. */
export const arrivalAsking = (state: MoveState): boolean => state === "claimed";

/** The first PIN on the new device: six digits, typed the same twice. */
export const newPinReady = (pin: string, again: string): boolean => /^\d{6}$/.test(pin) && pin === again;

/**
 * Every tick, and never over itself: a tick that finds the last ask still out skips, so a slow node
 * gets one question at a time instead of a pile that lands together and decides the screen twice
 * (review panel 2026-09-26, F1). `tick` returns its ask, or nothing when there is nothing to ask.
 * The faces call it from their own timers (web useEvery, ink useEvery).
 */
export function oneAtATime(tick: () => Promise<unknown> | void | undefined): () => void {
  let out = false;
  return () => {
    if (out) return;
    const running = tick();
    if (!running) return;
    out = true;
    void running.then(() => { out = false; }, () => { out = false; });
  };
}

/**
 * The name a browser gives itself in its claim: the other device shows it and nobody can check it
 * (§8.2), so the user agent's own words will do. `fallback` is the face's word for "browser".
 */
export function deviceLabel(userAgent: string, fallback: string): string {
  const ua = userAgent;
  const browser = /Firefox\//.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : fallback;
  const system = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return system ? `${browser}, ${system}` : browser;
}

/** The first letter of the claimant's name, for its round mark on the confirmation; "?" for none. */
export const initialOf = (label: string): string => [...label.trim()][0]?.toLocaleUpperCase() ?? "?";

/**
 * A step away (POST /away) as a screen reads it: the end as HH:MM in the device's clock, the whole
 * minutes left (at least one while it lasts), and whether it is over. `until` and `now` in seconds.
 */
export function awayClock(until: number, now: number): { time: string; minutes: number; over: boolean } {
  return {
    time: new Date(until * 1000).toTimeString().slice(0, 5),
    minutes: Math.max(1, Math.ceil((until - now) / 60)),
    over: now >= until,
  };
}
