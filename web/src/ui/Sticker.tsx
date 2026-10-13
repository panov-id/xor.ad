// A sticker reaction (owner 13.10.2026; sheets panel/design/adaptive-*-stickers.svg, *-table-sticker-*,
// *-chat-sticker-*): the glyph is the sheets' own (stickerArt.ts, generated), the tile and its rim the
// brand's — sosed a square block with a thick ink outline, neighbro a die-cut sticker with a light rim
// and its own lean. Decorative here: whoever shows it says its word next to it.

import { BRAND } from "../config.ts";
import { STICKER_ART } from "./stickerArt.ts";

export const STICKERS = STICKER_ART.map((s) => s.id);
// neighbro: every sticker its own lean, 3–5° (TILT_STICKER on the sheets).
const TILT = [-4, 3, -5, 4, -3, 5, -4, 3];

export function Sticker({ id, size = 48 }: { id: string; size?: number }) {
  const i = STICKER_ART.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const art = STICKER_ART[i];
  const neighbro = BRAND === "neighbro";
  return (
    <svg className="ui-sticker" data-tile={art.tile} width={size} height={size} viewBox="-4 -4 32 32" aria-hidden="true" focusable="false"
      style={neighbro ? { transform: `rotate(${TILT[i]}deg)` } : undefined}>
      {neighbro
        ? <rect x="-2" y="-2" width="28" height="28" rx="9.5" fill="var(--st)" stroke="var(--paper)" strokeWidth="2.2" paintOrder="stroke" />
        : <rect x="-2" y="-2" width="28" height="28" rx="6.2" fill="var(--st)" stroke="var(--fg)" strokeWidth="1.3" />}
      <g transform="translate(3.6 3.6) scale(0.7)" fill="none" stroke="var(--si)" strokeWidth={neighbro ? 2.2 : 2.6} strokeLinecap="round" strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: art.glyph }} />
    </svg>
  );
}
