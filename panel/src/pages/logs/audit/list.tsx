// Who changed what in the panel, and who tried to. Same explorer as the other
// logs; only the columns and the detail fields differ.

import { formatTime, LogExplorer, type LogRow } from "../../../components/log-explorer";
import { Badge } from "../../../components/badge";

// A denial is the row worth spotting at a glance, so it carries a badge. Nothing
// else does: almost every entry in this log is "applied", and badging all of them
// drew fifty-six frames down the column to say "normal" — which left the one row
// that mattered wearing the same shape as its neighbours. The outcome is still
// printed on every row; it is just a word where it is not news.
const outcomeCell = (row: LogRow) => {
  const outcome = String(row.outcome ?? "applied");
  return outcome === "denied"
    ? <Badge tone="danger">denied</Badge>
    : <span className="cell-quiet">{outcome}</span>;
};

export const AuditList = () => (
  <LogExplorer
    title="Audit log"
    endpoint="/admin/logs-audit"
    columns={[
      { key: "at", label: "When", render: (row) => formatTime(row.at ?? row.stored_at) },
      { key: "actor_email", label: "Actor" },
      { key: "action", label: "Action" },
      { key: "target", label: "Target" },
      { key: "outcome", label: "Outcome", render: outcomeCell },
    ]}
    facetField="action"
    facetLabel="all actions"
    searchField="actor_email"
    searchPlaceholder="filter loaded actors"
    detailFields={["actor_email", "actor_role", "reason", "before", "after", "node"]}
    // One platform-wide trail, filtered per reader — there is no second
    // collection to switch to.
    singleScope
  />
);
