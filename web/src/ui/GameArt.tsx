// A game's mini board on its tile (kit part «game», panel/design/adaptive-*-new-table-*.svg):
// the drawing is the sheets' own (gameArt.ts, generated), the tile and its frame
// the brand's (its rim here, its colours and lean in screens/newTable.css). Decorative:
// the card around it names the game.

import { BRAND } from "../config.ts";
import { GAME_ART } from "./gameArt.ts";

export function GameArt({ game, size = 120 }: { game: string; size?: number }) {
  const art = GAME_ART[game];
  if (!art) return null;
  return (
    <svg className="game-art" data-tile={art.tile} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {/* sosed a square block with an ink rim, neighbro a sticker with a light rim (game_part on the sheets) */}
      {BRAND === "neighbro"
        ? <rect className="game-art-tile" x="0" y="0" width="100" height="100" rx="20" stroke="var(--paper)" strokeWidth="6" paintOrder="stroke" />
        : <rect className="game-art-tile" x="0" y="0" width="100" height="100" rx="14" stroke="var(--fg)" strokeWidth="4" />}
      <g fill="none" stroke="var(--gi)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: art.body }} />
    </svg>
  );
}
