// Chapayev (sheet w3_table-chapayev): the 8×8 on the bare panel, my pieces lime at my edge. A tap on a piece of mine takes it
// up, a tap on a cell along a row, a column or a diagonal aims at it (an arrow from the piece), the same cell again flicks
// ({flick: {piece, dir, power}}); the node knows where the piece ends. Testids: chapayev, pc-<x:y>, aim.
import { useState } from "react";
import { flickTo, physicsOf } from "../../../../depth/core/tables_physics.ts";
import { say } from "../../i18n";
import type { BoardProps } from "./boards";
import { aimLine, chapayevCells, seatIndex } from "./chapayev-logic";

export function ChapayevBoard({ state, seat, seats, onMove }: BoardProps) {
  const [piece, setPiece] = useState<string | null>(null);
  const [aim, setAim] = useState<string | null>(null);
  const p = physicsOf(state as Record<string, unknown> | null);
  if (!p) return null;
  const n = seatIndex(seats, seat);
  const word = (stand: string, cell: string) => say(({ mine: "web.table.cell_mine", theirs: "web.table.cell_theirs", free: "web.table.cell_free" } as Record<string, string>)[stand], { cell });
  const tap = (id: string, stand: string) => {
    if (!onMove) return;
    if (stand === "mine") { setPiece(id === piece ? null : id); setAim(null); return; }
    const flick = piece && flickTo(piece, id);
    if (!flick) return;
    if (aim !== id) return setAim(id);
    onMove({ flick });
    setPiece(null); setAim(null);
  };
  const line = piece && aim ? aimLine(piece, aim, n) : null;
  return (
    <div className="tg-chapayev" role="group" aria-label={say("web.table.board")} data-testid="chapayev">
      {chapayevCells(p, seat, n).map((c) => (
        <button key={c.id} type="button" className="tg-pc" data-stand={c.stand} data-picked={c.id === piece || undefined} data-aim={c.id === aim || undefined}
          data-reach={(piece && c.stand !== "mine" && flickTo(piece, c.id) !== null) || undefined}
          disabled={!onMove || (c.stand !== "mine" && !(piece && flickTo(piece, c.id)))} onClick={() => tap(c.id, c.stand)} aria-label={word(c.stand, c.id)} data-testid={`pc-${c.id}`}>
          <span />
        </button>
      ))}
      {line && (
        <svg className="tg-aim" viewBox="0 0 8 8" aria-hidden="true" data-testid="aim">
          <defs><marker id="tb-aim-head" viewBox="0 0 4 4" refX="3" refY="2" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L4 2 L0 4 z" /></marker></defs>
          <line markerEnd="url(#tb-aim-head)" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
        </svg>
      )}
    </div>
  );
}
