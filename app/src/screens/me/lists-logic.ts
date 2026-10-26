// The pure part of "hidden" and "blocked" (w4_hidden, w4_blocked): the handles the node lists, the answer to a
// return or a lift, the count in the title, the day a block was set. No React, no node — tested in lists.test.ts.
import { dayMonth } from "./me-logic.ts";

export type HiddenRow = { id: string; kind: string; text: string };
export type BlockRow = { id: string; since: number };

/** DELETE /hidden/:id and DELETE /blocks/:id answer 204 for any handle, mine or not (SEC-14): 200 and 204 are done, anything else is not. */
export const lifted = (status: number): boolean => status === 204 || status === 200;

/** The list without the handle that was returned or lifted. */
export const without = <T extends { id: string }>(rows: readonly T[], id: string): T[] => rows.filter((r) => r.id !== id);

/** The title's count: "Hidden · 2"; before the list came (null) the bare word. */
export const titled = (word: string, rows: readonly unknown[] | null): string => (rows === null ? word : `${word} · ${rows.length}`);

/** The day a block was set as the sheet writes it ("9 Oct"); a moment the node did not give is "?". */
export const sinceDay = (lang: string, seconds: unknown): string =>
  typeof seconds === "number" && Number.isFinite(seconds) ? dayMonth(lang, new Date(seconds * 1000)) : "?";
