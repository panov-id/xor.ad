import { useGetIdentity, useList, usePermissions } from "@refinedev/core";
import { useState } from "react";
import { api } from "../../providers/api";
import { type Permission, type Role, ROLES } from "../../access";
import type { PanelIdentity } from "../../providers/auth";
import { Badge, toneForRole } from "../../components/badge";
import { DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/states";

type PanelUserRow = {
  id: string;
  email: string;
  role: Role;
  brand: string | null;
  created_at: string;
};

export const PanelUsersList = () => {
  // usePermissions returns a TanStack UseQueryResult, so the list is on `data`
  // (unlike useList below, which is Refine's own { result, query }).
  const { data: permissions } = usePermissions<Permission[]>({});
  const { result, query } = useList<PanelUserRow>({
    resource: "panel_users",
    sorters: [{ field: "created_at", order: "desc" }],
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("moderator");
  // Empty = the platform itself. Only the platform ever sees this control: a
  // tenant's operators are its own, and the relay ignores a brand it sends.
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState<string | null>(null);

  const canManageUsers = permissions?.includes("panel_users.write") ?? false;

  const { data: identity } = useGetIdentity<PanelIdentity>();
  const isPlatform = identity?.brand === null;
  // Only the platform can put an operator inside someone else's brand, so only
  // it needs the list. `enabled` keeps a tenant from asking for a page its role
  // would be refused anyway.
  const { result: brands } = useList<{ key: string }>({
    resource: "brands",
    pagination: { mode: "off" },
    queryOptions: { enabled: isPlatform && canManageUsers },
  });
  // A tenant cannot grant the platform role, and the relay refuses it anyway —
  // the select just stops offering what would be rejected.
  const roleOptions = isPlatform ? ROLES : ROLES.filter((role) => role !== "admin");

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const res = await api("/admin/panel-users", {
      method: "POST",
      body: JSON.stringify(brand ? { email, role, brand } : { email, role }),
    });
    setSubmitting(false);

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus({ kind: "err", text: body.error ?? "Invite failed" });
      return;
    }

    // The relay emails an operator it created inside a brand, and says whether
    // that letter went out. A platform operator gets no letter — they are the
    // people who already have the panel open.
    setStatus(
      body.invited
        ? { kind: "ok", text: `Added ${email} — an invitation is on its way.` }
        : {
          kind: "ok",
          text: brand
            ? `Added ${email}, but the invitation could not be sent. Try "Invite again".`
            : `Added ${email} — they can now sign in with their email.`,
        },
    );
    setEmail("");
    query.refetch();
  };

  const resendInvite = async (row: PanelUserRow) => {
    setResending(row.email);
    setStatus(null);
    const res = await api(`/admin/panel-users/${encodeURIComponent(row.email)}/invite`, {
      method: "POST",
    });
    setResending(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus({ kind: "err", text: body.error ?? "Could not send the invitation" });
      return;
    }
    setStatus({ kind: "ok", text: `Invitation sent to ${row.email} again.` });
  };

  return (
    <div className="panel-card">
      <h1>Panel users</h1>

      {canManageUsers && (
        <form onSubmit={onInvite} className="form-stack" aria-label="Invite a user">
          <div className="field">
            <label className="field-label" htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              type="email"
              placeholder="ops@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
          <div className="field">
          {/* Options come from the shared vocabulary, so a role added in the
              relay core shows up here without touching this page. */}
          <label className="field-label" htmlFor="invite-role">Role</label>
          <select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {roleOptions.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleOption}
              </option>
            ))}
          </select>
          </div>
          {/* Onboarding a tenant happens here: the platform names the brand, and
              the relay emails whoever it just let in. There is no self-service
              registration — a tenant is registered by us, never by itself. */}
          {isPlatform && (
            <div className="field">
            <label className="field-label" htmlFor="invite-brand">Brand</label>
            <select
              id="invite-brand"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
            >
              <option value="">platform</option>
              {(brands?.data ?? []).map((brandRow) => (
                <option key={brandRow.key} value={brandRow.key}>
                  {brandRow.key}
                </option>
              ))}
            </select>
            </div>
          )}
          </div>
          <div className="form-actions">
            <button type="submit" className="button-primary" disabled={submitting}>
              Invite
            </button>
          </div>
        </form>
      )}
      {/* The invite's only feedback: a failure has to be announced, not merely
          rendered. */}
      {status && (
        <p
          className={status.kind === "ok" ? "status-ok" : "status-err"}
          role={status.kind === "ok" ? "status" : "alert"}
          aria-live="polite"
        >
          {status.text}
        </p>
      )}
      {!canManageUsers && (
        <p className="auth-note">Your role can view panel users but not change them.</p>
      )}

      <DataTable<PanelUserRow>
        columns={[
          { key: "email", label: "Email" },
          {
            key: "role",
            label: "Role",
            render: (row) => <Badge tone={toneForRole(row.role)}>{row.role}</Badge>,
          },
          // Only the platform sees several tenants; for a tenant every row carries
          // the same brand, so the column would be noise.
          ...(isPlatform
            ? [{
              key: "brand",
              label: "Brand",
              render: (row: PanelUserRow) => <Badge>{row.brand ?? "platform"}</Badge>,
            }]
            : []),
          {
            key: "created_at",
            label: "Added",
            render: (row) => new Date(row.created_at).toLocaleString(),
          },
          // An invitation expires and letters get lost, so the way to send
          // another one lives next to the person it concerns.
          ...(canManageUsers
            ? [{
              key: "invite",
              label: "",
              render: (row: PanelUserRow) => (
                <button
                  type="button"
                  className="row-action"
                  disabled={resending === row.email}
                  onClick={() => void resendInvite(row)}
                >
                  {resending === row.email ? "Sending…" : "Invite again"}
                </button>
              ),
            }]
            : []),
        ]}
        rows={result?.data ?? []}
        rowId={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? "Loading the operator list failed." : null}
        onRetry={() => void query.refetch()}
        caption="Panel operators"
        empty={
          <EmptyState
            title="No operators yet."
            hint={canManageUsers
              ? "Invite one with the form above — they sign in by magic link."
              : "Someone with the right to manage users has to invite them."}
          />
        }
      />
    </div>
  );
};
