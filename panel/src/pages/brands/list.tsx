// The tenant registry. Adding one here is what makes onboarding a write rather
// than a redeploy — the node serving this page picks it up immediately, the rest
// of the pool within the registry's cache TTL.
//
// Brands seeded from the environment are listed but not editable: writing an
// override would shadow the seed with a copy that drifts from it, and the panel
// says so instead of failing on save.

import { useState } from "react";
import { useList } from "@refinedev/core";
import { api } from "../../providers/api";
import { Badge } from "../../components/badge";
import { DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/states";

type BrandRow = {
  id: string;
  key: string;
  name: string;
  domain: string;
  from: string;
  source: "registry" | "environment";
};

export const BrandsList = () => {
  const { result, query } = useList<BrandRow>({ resource: "brands", pagination: { mode: "off" } });
  const [form, setForm] = useState({ key: "", name: "", domain: "", from: "" });
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [name]: event.target.value }),
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    const response = await api("/admin/brands", { method: "POST", body: JSON.stringify(form) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setStatus({ kind: "err", text: body.error ?? `Saving failed (${response.status})` });
      return;
    }
    setStatus({ kind: "ok", text: `${body.name} is now a tenant. Mint it a key next.` });
    setForm({ key: "", name: "", domain: "", from: "" });
    void query.refetch();
  };

  return (
    <div className="panel-card">
      <h1>Brands</h1>

      <form className="form-stack" onSubmit={submit}>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="brand-key">Brand key</label>
            <input id="brand-key" {...field("key")} placeholder="sosed" required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="brand-name">Display name</label>
            <input id="brand-name" {...field("name")} placeholder="сосед" required />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor="brand-domain">Domain</label>
            <input id="brand-domain" {...field("domain")} placeholder="sosed.place" required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="brand-from">Sender address</label>
            <input id="brand-from" {...field("from")} placeholder="сосед <hey@sosed.place>" required />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={busy}>{busy ? "Saving…" : "Add brand"}</button>
        </div>
      </form>
      <p className="auth-note">
        The key becomes a storage path and cannot change afterwards. The sender must be
        an address on a domain the mail provider has verified, or the welcome email fails
        at send time.
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

      <DataTable<BrandRow>
        columns={[
          { key: "key", label: "Key" },
          { key: "name", label: "Name" },
          { key: "domain", label: "Domain" },
          { key: "from", label: "Sends as", wide: true },
          {
            key: "source",
            label: "Source",
            render: (row) =>
              row.source === "environment"
                ? <Badge title="Seeded from the BRANDS env; edit it there">environment</Badge>
                : <Badge tone="info">registry</Badge>,
          },
        ]}
        rows={result?.data ?? []}
        rowId={(row) => row.key}
        loading={query.isLoading}
        error={query.isError ? "Loading brands failed." : null}
        onRetry={() => void query.refetch()}
        caption="Tenant brands"
        empty={<EmptyState title="No brands yet." hint="Add one above to onboard a tenant." />}
      />
    </div>
  );
};
