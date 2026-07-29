// Shared log explorer: a scope, a time window, a histogram of that window, and a
// newest-first page that pages backwards by cursor. Every log page in the panel
// is this component plus a column description.
//
// It talks to the relay directly rather than through the Refine data provider:
// the response is an envelope (rows + window totals + histogram + which scopes it
// was read from), which is not the provider's list + total contract. The
// resources stay registered in Refine for the menu, the routes and the gates.

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useGetIdentity } from "@refinedev/core";
import { api } from "../../providers/api";
import type { PanelIdentity } from "../../providers/auth";
import { Badge } from "../badge";
import { type Column, DataTable } from "../data-table";
import { EmptyState } from "../states";

export interface LogRow {
  id: string;
  stored_at: string;
  // Which collection this row came from — set by the relay, not by the sink, so
  // it is present even on records that carry no brand of their own.
  scope?: string;
  [field: string]: unknown;
}

export type LogColumn = Column<LogRow>;

interface HistogramBucket {
  at: string;
  count: number;
}

interface LogPageResponse {
  rows: LogRow[];
  total: number;
  // Page views only: counted in the database, so it outlives the objects the
  // rest of this envelope is built from. Absent for every other collection.
  lifetime?: { views: number; first_views: number };
  matched: number;
  truncated: boolean;
  buckets: HistogramBucket[];
  scope?: {
    mode: "all" | "one";
    of: string[];
    capped?: number;
  };
}

interface LogExplorerProps {
  title: string;
  endpoint: string;
  columns: LogColumn[];
  facetField?: string;
  facetLabel?: string;
  searchField?: string;
  searchPlaceholder?: string;
  // Fields shown in the expanded row. Omit for collections whose shape varies
  // per record (server logs carry whatever the call site logged) — then the
  // whole record is shown rather than a guessed subset.
  detailFields?: string[];
  // Collections that belong to no tenant, offered beside the brands. Platform
  // only, like every other entry in that list.
  extraScopes?: { key: string; name: string }[];
  // Set when the collection exists in exactly one place (the node's own logs,
  // the audit trail): then there is nothing to switch and no switcher.
  singleScope?: boolean;
}

const RANGES = [
  { key: "15m", label: "15m", minutes: 15 },
  { key: "1h", label: "1h", minutes: 60 },
  { key: "24h", label: "24h", minutes: 60 * 24 },
  { key: "7d", label: "7d", minutes: 60 * 24 * 7 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"] | "custom";

// "All brands" is the empty value: it is what the relay does without a `brand`
// parameter, and it is the default because the alternative — the pre-migration
// archive — is empty by design and made the panel look broken.
const ALL_BRANDS = "";
const ARCHIVE = "platform";

const timeLabel: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

export const formatTime = (value: unknown): string =>
  typeof value === "string" && value
    ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

const asText = (value: unknown): string =>
  value === null || value === undefined || value === "" ? "—" : String(value);

export const LogExplorer = ({
  title,
  endpoint,
  columns,
  facetField,
  facetLabel = "all",
  searchField,
  searchPlaceholder = "filter loaded rows",
  detailFields,
  extraScopes = [],
  singleScope = false,
}: LogExplorerProps) => {
  const [range, setRange] = useState<RangeKey>("24h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [rows, setRows] = useState<LogRow[]>([]);
  const [buckets, setBuckets] = useState<HistogramBucket[]>([]);
  const [matched, setMatched] = useState(0);
  const [total, setTotal] = useState(0);
  const [lifetime, setLifetime] = useState<{ views: number; first_views: number } | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [readFrom, setReadFrom] = useState<LogPageResponse["scope"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [facet, setFacet] = useState("");
  const [search, setSearch] = useState("");

  const [scope, setScope] = useState(ALL_BRANDS);
  const [brands, setBrands] = useState<{ key: string; name: string }[]>([]);

  // Whose operator this is decides whether there is a switcher at all. Asked
  // here rather than by calling /admin/brands and reading the 403: a refusal is
  // a poor way to learn something the identity already says.
  const { data: identity } = useGetIdentity<PanelIdentity>();
  const isPlatform = identity?.brand === null;
  const showSwitcher = isPlatform && !singleScope;

  useEffect(() => {
    if (!showSwitcher) return;
    api("/admin/brands")
      .then((response) => (response.ok ? response.json() : []))
      .then(setBrands)
      .catch(() => setBrands([]));
  }, [showSwitcher]);

  // The window is resolved at fetch time, not at render time: "last 15m" must mean
  // 15 minutes before the request, not before the first paint.
  const windowParams = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (range === "custom") {
      if (customFrom) params.set("from", new Date(customFrom).toISOString());
      if (customTo) params.set("to", new Date(customTo).toISOString());
      return params;
    }
    const minutes = RANGES.find((candidate) => candidate.key === range)?.minutes ?? 60;
    params.set("from", new Date(Date.now() - minutes * 60_000).toISOString());
    return params;
  }, [range, customFrom, customTo]);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    const params = windowParams();
    if (cursor) params.set("before", cursor);
    // Empty means every brand the relay may merge; a value picks one collection.
    if (scope) params.set("brand", scope);

    const response = await api(`${endpoint}?${params.toString()}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? `Loading logs failed (${response.status})`);
      setLoading(false);
      return;
    }
    const page = await response.json() as LogPageResponse;
    // Paging back appends; a window change replaces. The histogram and the totals
    // always describe the whole window, so they are never appended to.
    setRows((previous) => (cursor ? [...previous, ...page.rows] : page.rows));
    setBuckets(page.buckets);
    setMatched(page.matched);
    setTotal(page.total);
    setLifetime(page.lifetime ?? null);
    setTruncated(page.truncated);
    setReadFrom(page.scope);
    setLoading(false);
  }, [endpoint, windowParams, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const facetValues = facetField
    ? [...new Set(rows.map((row) => asText(row[facetField])).filter((value) => value !== "—"))]
      .sort()
    : [];
  const visible = rows.filter((row) =>
    (!facet || !facetField || asText(row[facetField]) === facet) &&
    (!search || !searchField ||
      asText(row[searchField]).toLowerCase().includes(search.toLowerCase()))
  );
  const oldestLoaded = rows[rows.length - 1]?.stored_at;
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.count));
  // "stored" counts objects, and objects are pruned; the lifetime count is not.
  // Saying both keeps a prune from reading as a collapse in traffic.
  const lifetimeLabel = lifetime ? ` · ${lifetime.views} all time` : "";

  // A merged read needs to say which tenant each row belongs to; a single-scope
  // read would only repeat one value down the page.
  const merged = readFrom?.mode === "all" && readFrom.of.length > 1;
  const shownColumns: LogColumn[] = merged
    ? [
      ...columns,
      {
        key: "scope",
        label: "Brand",
        render: (row) => <Badge>{asText(row.scope)}</Badge>,
      },
    ]
    : columns;

  // Why a table might be empty, in the order a reader would suspect it. The
  // scope case exists because the default used to be the pre-migration archive,
  // and "nothing in this window" sent people looking at the clock instead.
  const emptyState = (): ReactNode => {
    if (rows.length > 0) {
      return (
        <EmptyState
          title="No rows match the filter."
          hint="The window has data — the facet or the search is hiding it."
          action={{ label: "Clear filters", onClick: () => { setFacet(""); setSearch(""); } }}
        />
      );
    }
    if (scope === ARCHIVE) {
      return (
        <EmptyState
          title="The pre-migration archive is empty."
          hint="Records written since the tenancy migration live under their brand."
          action={{ label: "Show all brands", onClick: () => setScope(ALL_BRANDS) }}
        />
      );
    }
    return (
      <EmptyState
        title="Nothing in this window."
        hint={total > 0
          ? `${total} record(s) exist outside it — try a wider range.`
          : "This collection has no records yet."}
        action={range === "7d" ? undefined : { label: "Widen to 7d", onClick: () => setRange("7d") }}
      />
    );
  };

  return (
    <div className="panel-card">
      <h1>{title}</h1>

      <div className="log-controls">
        {showSwitcher && (
          <label className="control-labelled">
            <span className="control-label">Scope</span>
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value={ALL_BRANDS}>All brands</option>
              {brands.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
              {extraScopes.map((item) => (
                <option key={item.key} value={item.key}>{item.name}</option>
              ))}
              <option value={ARCHIVE}>platform (pre-migration)</option>
            </select>
          </label>
        )}

        <div className="log-ranges" role="group" aria-label="Time range">
          {RANGES.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              className={range === candidate.key ? "range-active" : undefined}
              aria-pressed={range === candidate.key}
              onClick={() => setRange(candidate.key)}
            >
              {candidate.label}
            </button>
          ))}
          <button
            type="button"
            className={range === "custom" ? "range-active" : undefined}
            aria-pressed={range === "custom"}
            onClick={() => setRange("custom")}
          >
            custom
          </button>
        </div>

        {range === "custom" && (
          <div className="log-custom-range">
            <input
              type="datetime-local"
              aria-label="From"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
            <span>→</span>
            <input
              type="datetime-local"
              aria-label="To"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </div>
        )}

        {facetField && (
          <select value={facet} onChange={(event) => setFacet(event.target.value)} aria-label={facetLabel}>
            <option value="">{facetLabel}</option>
            {facetValues.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        )}

        {searchField && (
          <input
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}

        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {readFrom?.capped && (
        <p className="status-warn" role="status">
          Showing {readFrom.of.length} of {readFrom.capped} brands — pick one to see the rest.
        </p>
      )}

      {/* Counts across the window, computed from the storage listing alone — one
          series, so identity needs no legend; the heading names it. */}
      {buckets.length > 0 && (
        <figure className="log-histogram">
          <div className="log-histogram-bars">
            {buckets.map((bucket) => (
              // An empty bucket draws nothing: a hairline where there were no
              // events reads as a low steady rate, which is a lie.
              <div
                key={bucket.at}
                className={bucket.count > 0 ? "log-histogram-bar" : "log-histogram-gap"}
                style={bucket.count > 0
                  ? { height: `${Math.max(Math.round((bucket.count / peak) * 100), 4)}%` }
                  : undefined}
                title={`${new Date(bucket.at).toLocaleString()} — ${bucket.count}`}
              />
            ))}
          </div>
          {/* When, not just how much. Three bars over an unlabelled line left the
              reader to guess which hours they were looking at. */}
          <div className="log-histogram-axis" aria-hidden="true">
            <span>{new Date(buckets[0].at).toLocaleTimeString([], timeLabel)}</span>
            <span>{new Date(buckets[buckets.length - 1].at).toLocaleTimeString([], timeLabel)}</span>
          </div>
          <figcaption>
            {matched} in window · peak {peak} per bucket
          </figcaption>
        </figure>
      )}

      <DataTable
        columns={shownColumns}
        rows={visible}
        rowId={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        empty={emptyState()}
        caption={title}
        expanded={(row) => (
          <pre className="log-detail">
            {JSON.stringify(
              detailFields
                ? Object.fromEntries(detailFields.map((field) => [field, row[field]]))
                : row,
              null,
              2,
            )}
          </pre>
        )}
      />

      <div className="log-footer">
        {/* Announced when it changes: after "load older" or a window switch, the
            only thing that moves for a screen-reader user is this line. */}
        <span className="loading-note" role="status" aria-live="polite">
          {/* Never imply completeness: the relay caps every read. */}
          {visible.length === rows.length
            ? `${rows.length} loaded of ${matched} in window · ${total} stored${lifetimeLabel}`
            : `${visible.length} shown of ${rows.length} loaded · ${matched} in window · ${total} stored${lifetimeLabel}`}
          {truncated && " · older entries not loaded"}
        </span>
        {truncated && oldestLoaded && (
          <button type="button" onClick={() => void load(oldestLoaded)} disabled={loading}>
            Load older
          </button>
        )}
      </div>
    </div>
  );
};
