// The node's own warn/error lines, copied into storage by the relay's logger.
// Records carry whatever the call site logged, so the expanded row shows the
// whole record instead of a fixed field list.

import { formatTime, LogExplorer, type LogRow } from "../../../components/log-explorer";
import { Badge, toneForLevel } from "../../../components/badge";

// error over warn is the distinction worth seeing without reading — the level
// carries a badge rather than sitting as one more word in a column of text.
const levelBadge = (row: LogRow) => {
  const level = String(row.level ?? "info");
  return <Badge tone={toneForLevel(level)}>{level}</Badge>;
};

export const ServerLogsList = () => (
  <LogExplorer
    title="Server logs"
    endpoint="/admin/logs-server"
    columns={[
      { key: "ts", label: "When", render: (row) => formatTime(row.ts ?? row.stored_at) },
      { key: "level", label: "Level", render: levelBadge },
      { key: "msg", label: "Message", wide: true },
      { key: "route", label: "Route" },
      { key: "node", label: "Node" },
    ]}
    singleScope
    facetField="level"
    facetLabel="all levels"
    searchField="msg"
    searchPlaceholder="filter loaded messages"
  />
);
