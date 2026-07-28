// Publishable keys: what a landing sends so the relay knows whose data it is
// writing. Public by design — the key ships inside a page's JavaScript — so it
// is shown in full, and the page spends its care on the two things that are not
// obvious: which sites may use a key, and how to stop trusting one.

import { useState } from "react";
import { useGetIdentity, useList } from "@refinedev/core";
import { api } from "../../providers/api";
import type { PanelIdentity } from "../../providers/auth";
import { Badge } from "../../components/badge";
import { DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/states";

type ApiKeyRow = {
  id: string;
  brand: string;
  origins: string[];
  created_at: string;
  revoked_at: string | null;
  // null = unlimited, which is what a key has until someone sets an allowance.
  quota_events_per_day: number | null;
  used_today: number;
};

type BrandRow = { id: string; key: string; name: string };

export const ApiKeysList = () => {
  const { data: identity } = useGetIdentity<PanelIdentity>();
  const isPlatform = identity?.brand === null;

  const { result, query } = useList<ApiKeyRow>({ resource: "api_keys", pagination: { mode: "off" } });
  const { result: brandResult } = useList<BrandRow>({
    resource: "brands",
    pagination: { mode: "off" },
    queryOptions: { enabled: isPlatform },
  });

  const [brand, setBrand] = useState("");
  const [origins, setOrigins] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [minted, setMinted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mint = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    setMinted(null);
    const response = await api("/admin/api-keys", {
      method: "POST",
      body: JSON.stringify({
        brand: isPlatform ? brand : undefined,
        // One per line is how origins are read and how they will be re-read in
        // six months; commas invite "https://a.test, https://b.test" with a
        // space that silently becomes part of the value.
        origins: origins.split("\n").map((line) => line.trim()).filter(Boolean),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setStatus({ kind: "err", text: body.error ?? `Minting failed (${response.status})` });
      return;
    }
    setMinted(body.id);
    setOrigins("");
    setStatus({ kind: "ok", text: "Key minted. Put it in the landing's RELAY_PUBLISHABLE_KEY secret." });
    void query.refetch();
  };

  const setQuota = async (row: ApiKeyRow, raw: string) => {
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next < 1)) {
      setStatus({ kind: "err", text: "A quota is a positive number of requests per day, or empty for unlimited." });
      return;
    }
    if (next === row.quota_events_per_day) return; // nothing typed, nothing to say
    setStatus(null);
    const response = await api(`/admin/api-keys/${row.id}/quota`, {
      method: "PATCH",
      body: JSON.stringify({ quota_events_per_day: next }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatus({ kind: "err", text: body.error ?? "Setting the quota failed" });
      return;
    }
    setStatus({
      kind: "ok",
      text: next === null
        ? "Quota cleared — this key is unlimited again."
        : `Quota set to ${next} requests a day. It applies within about ten seconds.`,
    });
    void query.refetch();
  };

  const revoke = async (row: ApiKeyRow) => {
    setStatus(null);
    const response = await api(`/admin/api-keys/${row.id}/revoke`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatus({ kind: "err", text: body.error ?? "Revoking failed" });
      return;
    }
    // The relay caches key lookups, so a revoked key keeps working briefly. Say
    // it plainly rather than let someone believe the landing died instantly.
    setStatus({ kind: "ok", text: "Revoked. In-flight callers stop within a minute." });
    void query.refetch();
  };

  return (
    <div className="panel-card">
      <h1>Publishable keys</h1>

      <form className="invite-form" onSubmit={mint}>
        {isPlatform && (
          <select value={brand} onChange={(event) => setBrand(event.target.value)} required>
            <option value="">brand…</option>
            {brandResult?.data.map((item) => (
              <option key={item.key} value={item.key}>{item.name}</option>
            ))}
          </select>
        )}
        <textarea
          value={origins}
          onChange={(event) => setOrigins(event.target.value)}
          placeholder={"https://example.com\nhttps://www.example.com"}
          aria-label="Allowed origins, one per line"
          rows={2}
        />
        <button type="submit" disabled={busy}>{busy ? "Minting…" : "Mint key"}</button>
      </form>
      <p className="auth-note">
        A key is only usable from the origins listed here — one per line. Leaving it
        empty accepts any site, which the relay refuses on environments that require keys.
        {isPlatform && " A daily limit is counted per key and enforced within about ten seconds; leave it empty for unlimited."}
      </p>

      {status && (
        <p
          className={status.kind === "ok" ? "status-ok" : "status-err"}
          role={status.kind === "ok" ? "status" : "alert"}
          aria-live="polite"
        >
          {status.text}
        </p>
      )}
      {minted && (
        <div className="invite-link">
          <code>{minted}</code>
          <button type="button" onClick={() => void navigator.clipboard.writeText(minted)}>Copy</button>
        </div>
      )}

      <DataTable<ApiKeyRow>
        columns={[
          { key: "id", label: "Key", wide: true },
          ...(isPlatform
            ? [{
              key: "brand",
              label: "Brand",
              render: (row: ApiKeyRow) => <Badge>{row.brand}</Badge>,
            }]
            : []),
          {
            key: "origins",
            label: "Origins",
            render: (row) => row.origins.length ? row.origins.join(" · ") : "any site",
          },
          {
            key: "quota_events_per_day",
            label: "Today / limit",
            render: (row) => (
              <span className="quota-cell">
                <span className="quota-used">{row.used_today ?? 0}</span>
                <span className="quota-slash">/</span>
                {isPlatform && !row.revoked_at
                  ? (
                    <input
                      type="number"
                      min={1}
                      className="quota-input"
                      defaultValue={row.quota_events_per_day ?? ""}
                      placeholder="∞"
                      aria-label={`Daily limit for ${row.id}`}
                      // On blur rather than on every keystroke: a quota is a
                      // decision, not a slider.
                      onBlur={(event) => void setQuota(row, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                  )
                  : <span>{row.quota_events_per_day ?? "∞"}</span>}
              </span>
            ),
          },
          {
            key: "created_at",
            label: "Minted",
            render: (row) => new Date(row.created_at).toLocaleString(),
          },
          {
            key: "revoked_at",
            label: "State",
            render: (row) =>
              row.revoked_at
                ? <Badge tone="danger" title={new Date(row.revoked_at).toLocaleString()}>revoked</Badge>
                : (
                  <button type="button" className="state-action" onClick={() => void revoke(row)}>
                    Revoke
                  </button>
                ),
          },
        ]}
        rows={result?.data ?? []}
        rowId={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? "Loading keys failed." : null}
        onRetry={() => void query.refetch()}
        caption="Publishable API keys"
        empty={
          <EmptyState
            title="No keys yet."
            hint="Mint one above, then put it in the landing's RELAY_PUBLISHABLE_KEY secret."
          />
        }
      />
    </div>
  );
};
