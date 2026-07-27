// The panel's one table. Before this there were three: the log explorer's, the
// waitlist's and the operator list's — same markup, three sets of small
// decisions, and a badge that went red on one of them because nothing was shared.
//
// A page describes what to show (columns and rows); how a table looks, what it
// does while loading, and what it says when empty are decided here, once.

import { Fragment, type ReactNode, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "../states";

export interface Column<Row> {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
  wide?: boolean; // truncate with an ellipsis rather than growing the table
}

interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowId: (row: Row) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  // Shown when there is nothing to draw. A page knows why its table might be
  // empty; the table does not.
  empty?: ReactNode;
  // Returning null makes the row unexpandable, so a table of plain values has no
  // pointer cursor promising something that will not happen.
  expanded?: (row: Row) => ReactNode | null;
  caption?: string;
}

const cellValue = <Row,>(column: Column<Row>, row: Row): ReactNode => {
  if (column.render) return column.render(row);
  const value = (row as Record<string, unknown>)[column.key];
  return value === null || value === undefined || value === "" ? "—" : String(value);
};

export function DataTable<Row>({
  columns,
  rows,
  rowId,
  loading = false,
  error = null,
  onRetry,
  empty,
  expanded,
  caption,
}: DataTableProps<Row>) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && rows.length === 0) return <LoadingState />;
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing here yet." />}</>;
  }

  return (
    <table className="panel-table">
      {caption && <caption className="visually-hidden">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((column) => (
            // scope="col" is what tells a screen reader which header belongs to
            // the cell it is reading.
            <th key={column.key} scope="col">{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const id = rowId(row);
          const detail = expanded?.(row) ?? null;
          const isOpen = openRow === id;
          return (
            <Fragment key={id}>
              <tr
                className={detail ? "log-row" : undefined}
                onClick={detail ? () => setOpenRow(isOpen ? null : id) : undefined}
                aria-expanded={detail ? isOpen : undefined}
              >
                {columns.map((column) => (
                  // data-label carries the column name into the cell so a narrow
                  // screen can render the row as label/value pairs in CSS alone.
                  <td
                    key={column.key}
                    data-label={column.label}
                    className={column.wide ? "cell-wide" : undefined}
                  >
                    {cellValue(column, row)}
                  </td>
                ))}
              </tr>
              {detail && isOpen && (
                <tr className="log-detail-row">
                  <td colSpan={columns.length}>{detail}</td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
