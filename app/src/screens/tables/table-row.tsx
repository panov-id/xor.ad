// A table's row (sheets w3_tables, and w3_new-table-3 for the table as neighbours will see it): its face in the tile's
// colour, what it is called, «2 of 4 seated · 1 watching», and the way in. The same row on the list and in the wizard's
// preview, so the preview is what the list will say.
import { type Game, gameOfTable, makeTableWords, type TableCard, tableCounts } from "@sdk/new_table.ts";
import { label, say, sayCount } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { withSolo } from "./solo-logic";
import { subParts } from "./tables-logic";

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
  const c = tableCounts(card as TableCard);   // reads playing, free_seats and watching only
  return {
    title: card.name || (game ? label(gameName(game)) : label("table.title")),
    meta: withSolo(metaOf(game, card.set, !!card.name, countsLine(c.seated, c.seats, c.watching)), card.solo, say("app.tables.solo")),
  };
}

/** A game's drawing in the prototype's icon set (g-<name>): the node's ids «backgammon» and «dominoes» are the sheets' «tavli» and «domino». */
export const gameIcon = (id: string | undefined): string => `g-${id === "backgammon" ? "tavli" : id === "dominoes" ? "domino" : id ?? "dots"}`;

/** The colour of a game's chip in the wizard (new-table-1: the prototype's accents by game). */
const TINT: Record<string, number> = { dots: 6, checkers: 1, chess: 1, durak: 3, hangman: 6, backgammon: 2, dominoes: 1, chapayev: 4, reversi: 5, four: 2, battleship: 1, poker: 1 };
export const gameTint = (id: string): number => TINT[id] ?? 1;

/** A table as a tile (tables.html: the game's face, the name, the seats as dots — filled where someone sits — and the watchers).
 * `mine`: the person sits here, the tile is the accent's; `solo`: its player plays alone — an outline, the chip and «Sit» (tables-row-solo).
 * The tile is one button that opens the table; with no `onOpen` it is drawn and shut (aria-disabled), as the preview in the wizard. */
export function TableTile({ id, card, title, testid, mine, onOpen, preview }: {
  id?: string; card: Pick<TableCard, "game" | "set" | "playing" | "free_seats" | "watching" | "solo">; title: string; testid?: string; mine?: boolean; onOpen?: () => void; preview?: boolean;
}) {
  const game = gameOfTable(card.game, card.set);
  const c = tableCounts(card as TableCard);   // reads playing, free_seats and watching only
  const dots = Array.from({ length: Math.max(1, c.seats) }, (_, i) => i < c.seated);
  const solo = !!card.solo && !mine;
  const body = (
    <>
      <NdIcon name={gameIcon(game?.id)} className="k-tb-face" />
      {solo && <span className="k-tb-chip"><NdIcon name="alone" /><span>{say("app.tables.solo")}</span></span>}
      <div className="k-tb-info">
        <span className="k-tb-name">{title}</span>
        <div className="k-tb-seats">
          <span className="k-tb-pips" role="img" aria-label={countsLine(c.seated, c.seats, c.watching)}>
            {dots.map((on, i) => <span key={i} data-on={on || undefined} />)}
          </span>
          {c.watching > 0 && <><NdIcon name="eye" /><span className="k-meta">{c.watching}</span></>}
        </div>
        {solo && <span className="k-tb-join"><NdIcon name="plus" /><span>{say("app.tables.sit")}</span></span>}
      </div>
    </>
  );
  return (
    <li data-testid={testid} data-id={id}>
      {preview
        ? <div className="k-tile k-tb-tile" data-accent={mine || undefined} aria-hidden="true">{body}</div>
        : <button type="button" className="k-tile k-tb-tile" data-accent={mine || undefined} data-solo={solo || undefined} aria-disabled={onOpen ? undefined : true} onClick={onOpen} data-testid="table-open">{body}</button>}
    </li>
  );
}

/** The row as the old list drew it, kept for the callers that import it: the same tile. */
export function TableRow({ id, title, testid, onWatch, card }: { id?: string; tone?: string; title: string; meta?: string; testid?: string; onWatch?: () => void; preview?: boolean; card?: TableCard }) {
  return <TableTile id={id} card={card ?? {}} title={title} testid={testid} onOpen={onWatch} />;
}
