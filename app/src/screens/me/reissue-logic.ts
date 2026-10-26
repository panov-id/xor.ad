// The pure part of the new paper code (w4_reissue-1, w4_reissue-2; web screens/Reissue.tsx): when "Next" and "Done" are
// open, what the first step says about a code that is not sixteen characters, and whether the two typed-back groups
// are the new code's. No React, no node, no crypto — tested in reissue.test.ts. The path, not @sdk: node:test has no aliases.
import { cleanGroup, CODE_GROUP, groupsMatch } from "../../../../depth/core/register.ts";
import { CODE_LENGTH } from "./restore-logic.ts";

export { codeChars, refusalLine } from "./restore-logic.ts";

/** The groups the second step asks for back: the second and the fourth, as on the paper. */
export const PLACES = [2, 4] as const;

/** "Next" is open when all sixteen characters of the current code are in and nothing is being sent. */
export const nextReady = (code: string, busy: boolean): boolean => !busy && code.length === CODE_LENGTH;

/** What the first step says before it asks the device: a code that is not sixteen characters is not a paper code (a key), or null. */
export const notACode = (code: string): string | null => (code.length === CODE_LENGTH ? null : "restore.bad");

/** "Done" is open when both groups are typed whole (four characters each) and nothing is being sent. */
export const doneReady = (typed: readonly string[], busy: boolean): boolean =>
  !busy && cleanGroup(typed[0] ?? "").length === CODE_GROUP && cleanGroup(typed[1] ?? "").length === CODE_GROUP;

/** The typed second and fourth groups against the new code's groups; false means "check what you wrote down" (web.reissue.mismatch). */
export const groupsAgree = (groups: readonly string[], typed: readonly string[]): boolean => groupsMatch(groups, typed[0] ?? "", typed[1] ?? "");

/** The sixteen characters as the core wants them: four groups of four, the space the paper has. */
export const asPaperText = (code: string): string => code.replace(/(.{4})(?=.)/g, "$1 ");
