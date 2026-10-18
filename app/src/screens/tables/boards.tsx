// The boards on the table's panel (sheets w3_table-*), one per game, each drawing its own part of the node's state
// (relay/node/src/lib/tables_*.ts) through table-logic.ts; a tap is a move only in turn (onMove given), the node
// refuses the rest. Testids: four, four-col-<a..g>.
import type { TableView } from "@sdk/tables.ts";
import { say } from "../../i18n";
import { fourColumns, gridOf } from "./table-logic";

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
