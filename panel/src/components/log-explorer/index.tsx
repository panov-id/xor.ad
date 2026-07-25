// Shared log explorer: a time window, a histogram of the load in that window, and
// a newest-first page that pages backwards by cursor. Every log page in the panel
// is this component plus a column description.
//
// It talks to the relay directly rather than through the Refine data provider:
// the response is an envelope (rows + window totals + histogram), which is not the
// provider's list + total contract. The resources stay registered in Refine for
// the menu, the routes and the access gates.

import { Fragment, type ReactNode, useCallback, useEffect, useState } from "react";
import { api } from "../../providers/api";

export interface LogRow {
  id: string;
  stored_at: string;
  [field: string]: unknown;
}

export interface LogColumn {
  key: string;
  label: string;
  render?: (row: LogRow) => ReactNode;
  wide?: boolean; // truncate with an ellipsis instead of growing the table
}

interface HistogramBucket {
  at: string;
  count: number;
}

interface LogPageResponse {
  rows: LogRow[];
  total: number;
  matched: number;
  truncated: boolean;
  buckets: HistogramBucket[];
}

interface LogExplorerProps {
  title: string;
  endpoint: string;
  columns: LogColumn[];
  facetField?: string; // the field behind the "all …" select
  facetLabel?: string;
  searchField?: string; // the field the text filter matches, within loaded rows
  searchPlaceholder?: string;
  detailFields: string[]; // shown in the expanded row
}

const RANGES = [
  { key: "15m", label: "15m", minutes: 15 },
  { key: "1h", label: "1h", minutes: 60 },
  { key: "24h", label: "24h", minutes: 60 * 24 },
  { key: "7d", label: "7d", minutes: 60 * 24 * 7 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"] | "custom";

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
}: LogExplorerProps) => {
  const [range, setRange] = useState<RangeKey>("24h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [rows, setRows] = useState<LogRow[]>([]);
  const [buckets, setBuckets] = useState<HistogramBucket[]>([]);
  const [matched, setMatched] = useState(0);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [facet, setFacet] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

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
    setTruncated(page.truncated);
    setLoading(false);
  }, [endpoint, windowParams]);

  useEffect(() => {
    setExpanded(null);
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

  return (
    <div className="panel-card">
      <h1>{title}</h1>

      <div className="log-controls">
        <div className="log-ranges">
          {RANGES.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              className={range === candidate.key ? "range-active" : undefined}
              onClick={() => setRange(candidate.key)}
            >
              {candidate.label}
            </button>
          ))}
          <button
            type="button"
            className={range === "custom" ? "range-active" : undefined}
            onClick={() => setRange("custom")}
          >
            custom
          </button>
        </div>

        {range === "custom" && (
          <div className="log-custom-range">
            <input
              type="datetime-local"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
            <span>→</span>
            <input
              type="datetime-local"
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </div>
        )}

        {facetField && (
          <select value={facet} onChange={(event) => setFacet(event.target.value)}>
            <option value="">{facetLabel}</option>
            {facetValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        )}

        {searchField && (
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}

        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className="status-err">{error}</p>}

      {/* Counts across the window, computed from the storage listing alone — one
          series, so identity needs no legend; the heading names it. */}
      {buckets.length > 0 && (
        <figure className="log-histogram">
          <div className="log-histogram-bars">
            {buckets.map((bucket) => (
              <div
                key={bucket.at}
                className="log-histogram-bar"
                style={{ height: `${Math.round((bucket.count / peak) * 100)}%` }}
                title={`${new Date(bucket.at).toLocaleString()} — ${bucket.count}`}
              />
            ))}
          </div>
          <figcaption>
            {matched} in window · peak {peak} per bucket
          </figcaption>
        </figure>
      )}

      {loading && rows.length === 0 ? (
        <p className="loading-note">Loading…</p>
      ) : (
        <table className="panel-table">
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="loading-note">
                  Nothing in this window.
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <Fragment key={row.id}>
                <tr
                  className="log-row"
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={column.wide ? "log-message" : undefined}>
                      {column.render ? column.render(row) : asText(row[column.key])}
                    </td>
                  ))}
                </tr>
                {expanded === row.id && (
                  <tr>
                    <td colSpan={columns.length}>
                      <pre className="log-detail">
                        {JSON.stringify(
                          Object.fromEntries(detailFields.map((field) => [field, row[field]])),
                          null,
                          2,
                        )}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <div className="log-footer">
        <span className="loading-note">
          {/* Never imply completeness: the relay caps every read. */}
          {visible.length === rows.length
            ? `${rows.length} loaded of ${matched} in window · ${total} stored`
            : `${visible.length} shown of ${rows.length} loaded · ${matched} in window · ${total} stored`}
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
