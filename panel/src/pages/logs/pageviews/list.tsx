// Page views reported by the landings — our own counter, in place of a third
// party. Cookie-free by construction, so the rows carry no visitor: what there
// is to look at is which pages, in which language, from where.

import { formatTime, LogExplorer, type LogRow } from "../../../components/log-explorer";

// A view that opened a tab is worth telling apart from a click deeper into the
// site — it is the closest thing to "someone arrived" that a counter without
// storage on the device can honestly say.
const arrivalBadge = (row: LogRow) => (
  row.first_in_tab ? <span className="badge badge-accent">first</span> : <span className="badge">·</span>
);

// Empty means someone typed the address or came from a client that sends no
// referrer; "direct" says that plainly rather than leaving a blank cell.
const referrer = (row: LogRow) => String(row.referrer_host ?? "direct");

export const PageviewsList = () => (
  <LogExplorer
    title="Page views"
    endpoint="/admin/logs-pageviews"
    columns={[
      { key: "received_at", label: "When", render: (row) => formatTime(row.received_at ?? row.stored_at) },
      { key: "path", label: "Path", wide: true },
      { key: "lang", label: "Lang" },
      { key: "referrer_host", label: "From", render: referrer },
      { key: "viewport", label: "Screen" },
      { key: "first_in_tab", label: "Arrival", render: arrivalBadge },
    ]}
    facetField="lang"
    facetLabel="all languages"
    searchField="path"
    searchPlaceholder="filter loaded paths"
    detailFields={["received_at", "stored_at", "path", "lang", "referrer_host", "viewport", "source"]}
  />
);
