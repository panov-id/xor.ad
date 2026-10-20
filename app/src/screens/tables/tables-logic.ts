// The tables' pure part (sosed Dusk w3_tables, w3_new-table-1..3): what a page of GET /tables becomes on the list,
// the colour a tile takes, and the wizard's steps. The node's own calls are the SDK's (@sdk/client.ts tables,
// @sdk/tables.ts create); the games, the counts and the body of POST /tables are depth/core/new_table.ts, shared
// with the web's NewTable — here it is a function a test can call.
import type { Radius } from "../../../../depth/core/client.ts";
import { type Draft, emptyDraft, gameById, pickGame, type TableCard } from "../../../../depth/core/new_table.ts";

/** The circle the list looks in and a new table is shown in: the feed's own default (the sheets have no radius to choose here). */
export const TABLES_RADIUS: Radius = 1000;

/** The tile's colour, in the sheets' order: lime, yellow, peach, lilac, round again (w3_tables, w3_new-table-1). */
export type Tone = "lime" | "yellow" | "peach" | "lilac";
const TONES: Tone[] = ["lime", "yellow", "peach", "lilac"];
export const toneAt = (index: number): Tone => TONES[((index % TONES.length) + TONES.length) % TONES.length];

/** A page after the cursor joins the list; the first page replaces it. A table seen twice (a page edge) is drawn once. */
export function mergeTables(was: readonly TableCard[], page: readonly TableCard[], after?: string): TableCard[] {
  if (!after) return [...page];
  const seen = new Set(was.map((c) => c.id));
  return [...was, ...page.filter((c) => !seen.has(c.id))];
}

/** The tables the person sits at or liked stand above the list; the list leaves them out, so a card is never drawn twice. */
export const apart = (items: readonly TableCard[], mine: readonly TableCard[]): TableCard[] => {
  const own = new Set(mine.map((c) => c.id));
  return items.filter((c) => !own.has(c.id));
};

/** The wizard: step 1 picks a game, 2 its variant, seats and name, 3 shows the table as neighbours see it. */
export type Step = 1 | 2 | 3;
export interface Wizard { step: Step; draft: Draft }
export const startWizard = (): Wizard => ({ step: 1, draft: emptyDraft() });

/** Tapping a game's tile picks it (its first variant, its fewest seats) and stays on step 1: «Next» goes on. */
export const pick = (w: Wizard, id: string): Wizard => (gameById(id) ? { ...w, draft: pickGame(w.draft, id) } : w);

/** Step 1 needs a game; the rest are always ready (a variant and the seats stand from the pick, the name is optional). */
export const canNext = (w: Wizard): boolean => w.step === 3 ? false : w.step === 2 || w.draft.game !== null;

export const next = (w: Wizard): Wizard => (canNext(w) ? { ...w, step: (w.step + 1) as Step } : w);

/** Back: one step before, from step 1 out of the wizard (null) to where the person came from. */
export const back = (w: Wizard): Wizard | null => (w.step === 1 ? null : { ...w, step: (w.step - 1) as Step });

/** A table made but the node refused its name: mended where the name is typed, on step 2. */
export const nameRefused = (w: Wizard): Wizard => ({ ...w, step: 2 });

/** The sub-line of a table: its parts that are words, the variant dropped when it is the game's own name («backgammon · backgammon»). */
export function subParts(parts: Array<string | null | undefined | false>): string {
  const seen = new Set<string>();
  return parts.filter((p): p is string => !!p && !seen.has(p.toLowerCase()) && !!seen.add(p.toLowerCase())).join(" · ");
}
