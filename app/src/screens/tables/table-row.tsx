// A table's row (sheets w3_tables, and w3_new-table-3 for the table as neighbours will see it): its face in the tile's
// colour, what it is called, «2 of 4 seated · 1 watching», and the way in. The same row on the list and in the wizard's
// preview, so the preview is what the list will say.
import { type Game, gameOfTable, makeTableWords, type TableCard, tableCounts } from "@sdk/new_table.ts";
import { label, say, sayCount } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { die } from "./icons";
import { subParts, type Tone } from "./tables-logic";

const words = makeTableWords(say);
export const { gameName, variantWord } = words;

/** The counts of a table in words: «2 of 4 seated · 1 watching». */
export const countsLine = (seated: number, seats: number, watching: number): string =>
  `${sayCount("app.tables.seated", seated, { seats })} · ${sayCount("app.tables.watching", watching)}`;

/**
 * The sub-line: the counts (w3_tables: nothing else on a table with no name); a table with a name says its game first and its
 * variant (never the variant that is the game's own name — «backgammon · backgammon»).
 */
export function metaOf(game: Game | undefined, set: string | undefined, named: boolean, counts: string): string {
  const variant = named && game && set ? variantWord(game.id, set) : null;
  return subParts([named && game ? label(gameName(game)) : null, variant, counts]);
}

/** What a card of GET /tables says: its name, else its game's; the sub-line from its counts. */
export function lineOf(card: TableCard): { title: string; meta: string } {
  const game = gameOfTable(card.game, card.set);
  const c = tableCounts(card);
  return {
    title: card.name || (game ? label(gameName(game)) : label("table.title")),
    meta: metaOf(game, card.set, !!card.name, countsLine(c.seated, c.seats, c.watching)),
  };
}

export function TableRow({ id, tone, title, meta, testid, onWatch, preview }: {
  id?: string; tone: Tone; title: string; meta: string; testid?: string; onWatch?: () => void; preview?: boolean;
}) {
  return (
    <li className={`tb-row tb-${tone}`} data-testid={testid} data-id={id}>
      <span className="tb-face" aria-hidden="true"><Icon d={die} /></span>
      <div className="tb-text"><p className="tb-name">{title}</p><p className="tb-meta">{meta}</p></div>
      {preview
        ? <span className="tb-watch" aria-hidden="true">{say("app.tables.watch")}</span>
        : <button type="button" className="tb-watch" aria-disabled={onWatch ? undefined : true} onClick={onWatch} data-testid="table-open">{say("app.tables.watch")}</button>}
    </li>
  );
}
