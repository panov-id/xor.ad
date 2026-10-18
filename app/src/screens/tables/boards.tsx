// The boards on the table's panel (sheets w3_table-*), one per game, each drawing its own part of the node's state
// (relay/node/src/lib/tables_*.ts) through table-logic.ts; a tap is a move only in turn (onMove given), the node
// refuses the rest. Testids: four, four-col-<a..g>; dots, dot, edge-<id>, box.
import { dotsOf, type TableView } from "@sdk/tables.ts";
import { say } from "../../i18n";
import { dotsLayout, fourColumns, gridOf } from "./table-logic";

type Move = (m: unknown) => void;

// Four in a row (w3_table-four): 7 columns of 6, a tap anywhere in an open column drops a piece in it ({column}).
export function FourBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
  const grid = gridOf(view);
  if (!grid) return null;
  return (
    <div className="tb-four" role="group" aria-label={say("web.table.columns")} data-testid="four">
      {fourColumns(grid, view.seat).map((c) => (
        <button key={c.column} type="button" className="tb-col" disabled={!onMove || !c.open} onClick={() => onMove?.({ column: c.column })}
          aria-label={say("web.table.column", { col: c.column })} data-testid={`four-col-${c.column}`}>
          {c.cells.map((s, i) => <span key={i} className="tb-cell" data-stand={s} />)}
        </button>
      ))}
    </div>
  );
}

// Dots (w3_table-dots): the dots, the taken edges as lines, closed boxes in their owner's tone; a free edge is a press
// ({edge}) with a wide touch area around its thin line.
export function DotsBoard({ view, onMove }: { view: TableView; onMove?: Move }) {
  const dots = dotsOf(view.board);
  if (!dots) return null;
  const l = dotsLayout(dots, view.seat);
  const at = (r: number, c: number) => ({ "--r": r, "--c": c }) as React.CSSProperties;
  return (
    <div className="tb-dots" style={{ "--n": l.n } as React.CSSProperties} role="group" aria-label={say("web.table.board")} data-testid="dots">
      {l.boxes.map((b) => <span key={`b${b.r}:${b.c}`} className="tb-box" data-stand={b.stand} style={at(b.r, b.c)} data-testid="box" />)}
      {l.edges.map((e) => (
        <button key={e.id} type="button" className="tb-edge" data-dir={e.dir} data-taken={e.taken || undefined} style={at(e.r, e.c)}
          disabled={e.taken || !onMove} onClick={() => onMove?.({ edge: e.id })} aria-label={e.id} data-testid={`edge-${e.id}`}>
          <span />
        </button>
      ))}
      {Array.from({ length: (l.n + 1) ** 2 }, (_, i) => <span key={`d${i}`} className="tb-dot" style={at(Math.floor(i / (l.n + 1)), i % (l.n + 1))} data-testid="dot" />)}
    </div>
  );
}
