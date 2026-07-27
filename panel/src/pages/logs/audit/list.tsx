// Who changed what in the panel, and who tried to. Same explorer as the other
// logs; only the columns and the detail fields differ.

import { formatTime, LogExplorer, type LogRow } from "../../../components/log-explorer";
import { Badge } from "../../../components/badge";

// A denial is the row worth spotting at a glance, so it carries a badge rather
// than a bare word in a column of identical-looking text. "denied" is the only
// outcome that warns; the rest are statements of fact.
const outcomeBadge = (row: LogRow) => {
  const outcome = String(row.outcome ?? "applied");
  return <Badge tone={outcome === "denied" ? "danger" : "neutral"}>{outcome}</Badge>;
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
      { key: "outcome", label: "Outcome", render: outcomeBadge },
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
