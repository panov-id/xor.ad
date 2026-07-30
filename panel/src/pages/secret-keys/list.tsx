// Secret keys: what a tenant's own server sends to the public API. The opposite
// of a publishable key in the one way that shapes this whole page — the secret
// exists exactly once, in the response that creates it. There is no "show it
// again", because the relay keeps only its hash and cannot answer that either.
//
// So the page is built around that moment: the secret appears in a panel that
// says it will not come back, and everything else here is about deciding when a
// key should stop working.

import { useState } from "react";
import { useGetIdentity, useList } from "@refinedev/core";
import { api } from "../../providers/api";
import { KEY_ONLY_SCOPES, type Permission, PERMISSIONS } from "../../access";
import type { PanelIdentity } from "../../providers/auth";
import { Badge } from "../../components/badge";
import { DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/states";

type SecretKeyRow = {
  id: string;
  brand: string;
  name: string;
  scopes: Permission[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  quota_events_per_day: number | null;
  used_today?: number;
};

type BrandRow = { id: string; key: string; name: string };

export const SecretKeysList = () => {
  const { data: identity } = useGetIdentity<PanelIdentity>();
  const isPlatform = identity?.brand === null;
  const mayWrite = identity?.permissions?.includes("api_keys.write") ?? false;

  const { result, query } = useList<SecretKeyRow>({
    resource: "secret_keys",
    pagination: { mode: "off" },
  });
  const { result: brandResult } = useList<BrandRow>({
    resource: "brands",
    pagination: { mode: "off" },
    queryOptions: { enabled: isPlatform && mayWrite },
  });

  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Permission[]>([]);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // A key may never hold more than its issuer does — the relay refuses it
  // anyway, so the list only offers what would be accepted. The key-only scopes
  // are the exception at both ends: nobody holds them, and the relay accepts them
  // from any issuer for their own brand, so filtering them out here would leave a
  // tenant with nothing to pick.
  const offered = PERMISSIONS.filter((permission) =>
    KEY_ONLY_SCOPES.includes(permission) ||
    (identity?.permissions?.includes(permission) ?? false)
  );

  const toggle = (permission: Permission) =>
    setScopes((current) =>
      current.includes(permission)
        ? current.filter((entry) => entry !== permission)
        : [...current, permission]
    );

  const mint = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    setMinted(null);
    setCopied(false);

    const response = await api("/admin/secret-keys", {
      method: "POST",
      body: JSON.stringify(brand ? { brand, name, scopes } : { name, scopes }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setStatus({ kind: "err", text: body.error ?? "Could not mint the key" });
      return;
    }
    setMinted(body.secret);
    setName("");
    setScopes([]);
    query.refetch();
  };

  const copy = async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted);
      setCopied(true);
    } catch {
      setStatus({ kind: "err", text: "Couldn't copy — select the key and copy it manually." });
    }
  };

  const setQuota = async (row: SecretKeyRow, raw: string) => {
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next < 1)) {
      setStatus({ kind: "err", text: "A quota is a positive number of requests per day, or empty for unlimited." });
      return;
    }
    if (next === row.quota_events_per_day) return; // nothing typed, nothing to say
    setStatus(null);
    const response = await api(`/admin/secret-keys/${encodeURIComponent(row.id)}/quota`, {
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
    query.refetch();
  };

  const revoke = async (row: SecretKeyRow) => {
    setStatus(null);
    const response = await api(`/admin/secret-keys/${encodeURIComponent(row.id)}/revoke`, {
      method: "POST",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatus({ kind: "err", text: body.error ?? "Could not revoke" });
      return;
    }
    setStatus({ kind: "ok", text: `${row.name} will not be accepted again.` });
    query.refetch();
  };

  return (
    <div className="panel-card">
      <h1>Secret keys</h1>
      <p className="auth-note">
        For a server calling <code>/v1</code>. Shown once — the relay keeps only a hash.
      </p>

      {mayWrite && (
        <form onSubmit={mint} className="form-stack">
          <div className="form-row">
            <div className="field">
              <label className="field-label" htmlFor="secret-name">What is it for</label>
              <input
                id="secret-name"
                type="text"
                placeholder="nightly importer"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            {isPlatform && (
              <div className="field">
                <label className="field-label" htmlFor="secret-brand">Brand</label>
                <select id="secret-brand" value={brand} onChange={(event) => setBrand(event.target.value)}>
                  <option value="">pick a brand</option>
                  {(brandResult?.data ?? []).map((row) => (
                    <option key={row.key} value={row.key}>{row.key}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {/* A group of ticks is named by a legend, not by the field beside it. */}
          <fieldset className="field">
            <legend className="field-label">Scopes</legend>
            <div className="scope-picker">
            {offered.map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={scopes.includes(permission)}
                  onChange={() => toggle(permission)}
                />
                {permission}
              </label>
            ))}
            </div>
          </fieldset>
          <div className="form-actions">
            <button type="submit" className="button-primary" disabled={busy || scopes.length === 0}>Mint key</button>
          </div>
        </form>
      )}

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
          <button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          <p className="auth-note">
            <strong>This is the only time it is shown.</strong> Store it now — nobody, here
            included, can read it back. Lost means minting another.
          </p>
        </div>
      )}

      <DataTable<SecretKeyRow>
        columns={[
          { key: "name", label: "Name" },
          { key: "id", label: "Key", wide: true },
          ...(isPlatform
            ? [{
              key: "brand",
              label: "Brand",
              render: (row: SecretKeyRow) => <Badge>{row.brand}</Badge>,
            }]
            : []),
          {
            key: "scopes",
            label: "Scopes",
            render: (row) => (
              <>{row.scopes.map((scope) => <Badge key={scope} tone="info">{scope}</Badge>)}</>
            ),
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
            key: "last_used_at",
            label: "Last used",
            // The question that decides whether a key is safe to revoke.
            render: (row) =>
              row.last_used_at ? new Date(row.last_used_at).toLocaleString() : "never",
          },
          {
            key: "revoked_at",
            label: "State",
            render: (row) =>
              row.revoked_at
                ? <Badge tone="danger">revoked</Badge>
                : <Badge tone="accent">live</Badge>,
          },
          ...(mayWrite
            ? [{
              key: "revoke",
              label: "",
              render: (row: SecretKeyRow) =>
                row.revoked_at ? null : (
                  <button type="button" className="row-action button-danger" onClick={() => void revoke(row)}>
                    Revoke
                  </button>
                ),
            }]
            : []),
        ]}
        rows={result?.data ?? []}
        rowId={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? "Loading the key list failed." : null}
        onRetry={() => void query.refetch()}
        caption="Secret keys"
        empty={
          <EmptyState
            title="No secret keys yet."
            hint={mayWrite
              ? "Mint one above for a server that calls /v1."
              : "Someone with the right to manage keys has to mint them."}
          />
        }
      />
    </div>
  );
};
