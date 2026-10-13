import type { CSSProperties } from "react";
import { say } from "../locales/say.ts";

// Board `dots` (kit_RU.md §3.3, К6): a group of free edges, each a button whose
// name is in words — «линия: ряд 1, колонка 2, по горизонтали», never `h:0:0`;
// a taken edge is a mark that says «занято» in its name; a closed box says whose
// it is — the owner's initial to the eye, «клетка: ряд 1, колонка 1, Аня» to a
// screen reader, and an own box is filled where the other's is outlined. An edge
// is 24×24 at least (the board's exception to 44): the box lies between two dots.
// The edge ids (`h:r:c`, `v:r:c`) stay on `data-edge` / `data-taken` for the specs.
const CELL = 48, PAD = 16, HIT = 24;

export function edgeName(id: string): string {
  const [kind, row, col] = id.split(":");
  return say(kind === "h" ? "web.table.edge_h" : "web.table.edge_v", { row: Number(row) + 1, col: Number(col) + 1 });
}

export function DotsGrid({ label, n, free, boxes, who, mine, onEdge }: {
  label: string;
  n: number;
  free: ReadonlySet<string>;
  /** `r:c` of a closed box → the seat that closed it. */
  boxes: Readonly<Record<string, number>>;
  who: (seat: number) => string;
  mine: number;
  onEdge?: (edge: string) => void;
}) {
  const size = n * CELL + PAD * 2;
  const edges: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
  for (let r = 0; r <= n; r++) {
    for (let c = 0; c < n; c++) {
      edges.push({ id: `h:${r}:${c}`, x1: PAD + c * CELL, y1: PAD + r * CELL, x2: PAD + (c + 1) * CELL, y2: PAD + r * CELL });
    }
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n; c++) {
      edges.push({ id: `v:${r}:${c}`, x1: PAD + c * CELL, y1: PAD + r * CELL, x2: PAD + c * CELL, y2: PAD + (r + 1) * CELL });
    }
  }
  return (
    <svg className="ui-board" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="group" aria-label={label} data-testid="dots">
      {Object.entries(boxes).map(([box, seat]) => {
        const [r, c] = box.split(":").map(Number);
        const name = who(seat);
        return (
          <g key={box} role="img" className="ui-board-box" data-own={seat === mine ? "yes" : "no"}
            aria-label={say("web.table.box", { row: r + 1, col: c + 1, who: name })}>
            <rect x={PAD + c * CELL + 6} y={PAD + r * CELL + 6} width={CELL - 12} height={CELL - 12} rx={6} />
            <text x={PAD + c * CELL + CELL / 2} y={PAD + r * CELL + CELL / 2 + 5} textAnchor="middle" aria-hidden="true">
              {[...name][0]?.toLocaleUpperCase() ?? "?"}
            </text>
          </g>
        );
      })}
      {edges.map((e) => {
        if (!free.has(e.id)) {
          return <line key={e.id} {...e} className="ui-board-taken" role="img" aria-label={say("web.table.edge_taken", { edge: edgeName(e.id) })} data-taken={e.id} />;
        }
        const horizontal = e.y1 === e.y2;
        return (
          <g key={e.id}>
            <line {...e} className={onEdge ? "ui-board-free ui-board-free-on" : "ui-board-free"} pointerEvents="none" />
            <rect className="ui-board-hit" x={horizontal ? e.x1 + HIT / 2 : e.x1 - HIT / 2} y={horizontal ? e.y1 - HIT / 2 : e.y1 + HIT / 2}
              width={horizontal ? CELL - HIT : HIT} height={horizontal ? HIT : CELL - HIT}
              role={onEdge ? "button" : undefined} aria-label={onEdge ? edgeName(e.id) : undefined}
              data-edge={e.id} tabIndex={onEdge ? 0 : undefined} data-live={onEdge ? "yes" : "no"}
              onClick={onEdge ? () => onEdge(e.id) : undefined}
              onKeyDown={onEdge ? (k) => (k.key === "Enter" || k.key === " ") && onEdge(e.id) : undefined} />
          </g>
        );
      })}
      {Array.from({ length: (n + 1) ** 2 }, (_, i) => (
        <circle key={i} className="ui-board-dot" cx={PAD + (i % (n + 1)) * CELL} cy={PAD + Math.floor(i / (n + 1)) * CELL} r={3} />
      ))}
    </svg>
  );
}

// Board `cells` (К6): the 8×8 as text for the eye, and a description of the
// position for a screen reader — `img` named «доска: e2 P, e7 p, …», so the
// glyph grid is not read cell by cell.
export function CellsGrid({ label, rows, described, ...rest }: {
  label: string;
  rows: readonly (readonly string[])[];
  described: readonly string[];
  // `data-*` pass through (the specs find a board by them).
  [data: `data-${string}`]: string | undefined;
}) {
  return (
    <pre {...rest} className="ui-board-cells" role="img" aria-label={described.length ? `${label}: ${described.join(", ")}` : label}>
      {rows.map((row) => row.join(" ")).join("\n")}
    </pre>
  );
}

// Board `tap` (reversi, battleship, four in a row's columns): a grid whose
// cells are buttons, each named in words («c4: свободно»), a tap sending the
// move that cell stands for. A cell with no `onTap` (taken, already shot, not
// one's turn) stays as a disabled button, so the position reads whole. A cell
// is small by the board's own exception to 44, as the dots' edges are: ten
// across a phone is about 30. `tone` is for the CSS (whose piece, what the
// shot found), `data-cell` for the specs.
export type TapCell = { id: string; glyph: string; name: string; tone?: string; onTap?: () => void };

export function TapGrid({ label, cols, cells, ...rest }: {
  label: string;
  cols: number;
  cells: readonly TapCell[];
  [data: `data-${string}`]: string | undefined;
}) {
  return (
    <div {...rest} role="group" aria-label={label} className="ui-board-tap" style={{ "--cols": cols } as CSSProperties}>
      {cells.map((cell) => (
        <button key={cell.id} type="button" className="ui-board-tap-cell" data-cell={cell.id} data-tone={cell.tone}
          aria-label={cell.name} disabled={!cell.onTap} onClick={cell.onTap}>
          <span aria-hidden="true">{cell.glyph}</span>
        </button>
      ))}
    </div>
  );
}
