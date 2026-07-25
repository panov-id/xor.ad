// Client errors reported by the landings — the log explorer plus this collection's
// columns. Everything about windows, histograms and paging lives in the explorer.

import { formatTime, LogExplorer } from "../../../components/log-explorer";

export const ClientErrorsList = () => (
  <LogExplorer
    title="Client errors"
    endpoint="/admin/logs-client-errors"
    columns={[
      // received_at is written by the sink; stored_at is when the object landed.
      { key: "received_at", label: "Received", render: (row) => formatTime(row.received_at ?? row.stored_at) },
      { key: "kind", label: "Kind" },
      { key: "message", label: "Message", wide: true },
      { key: "page_url", label: "Page" },
      { key: "source", label: "Source" },
    ]}
    facetField="kind"
    facetLabel="all kinds"
    searchField="message"
    searchPlaceholder="filter loaded messages"
    detailFields={["received_at", "stored_at", "user_agent", "stack", "extra"]}
  />
);
