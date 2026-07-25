import { useList, usePermissions } from "@refinedev/core";
import { useState } from "react";
import { api } from "../../providers/api";
import { type Permission, type Role, ROLES } from "../../access";

type PanelUserRow = {
  id: string;
  email: string;
  role: Role;
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
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canManageUsers = permissions?.includes("panel_users.write") ?? false;

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    setInviteLink(null);
    setCopied(false);

    const res = await api("/admin/panel-users", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus({ kind: "err", text: body.error ?? "Invite failed" });
      return;
    }

    // No hand-off link: the invitee just signs in from the login page with their
    // email (the relay emails them a magic link). Membership is what we granted.
    setStatus({ kind: "ok", text: `Added ${email} — they can now sign in with their email.` });
    setInviteLink(null);
    setEmail("");
    query.refetch();
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      // Clipboard unavailable (insecure origin / denied permission). The link
      // stays visible in the <code> block for manual copy.
      setStatus({ kind: "err", text: "Couldn't copy — select the link and copy it manually." });
    }
  };

  return (
    <div className="panel-card">
      <h1>Panel users</h1>

      {canManageUsers && (
        <form onSubmit={onInvite} className="auth-form panel-invite-form">
          <input
            type="email"
            placeholder="email to invite"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {/* Options come from the shared vocabulary, so a role added in the
              relay core shows up here without touching this page. */}
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleOption}
              </option>
            ))}
          </select>
          <button type="submit" disabled={submitting}>
            Invite
          </button>
        </form>
      )}
      {status && <p className={status.kind === "ok" ? "status-ok" : "status-err"}>{status.text}</p>}
      {inviteLink && (
        <div className="invite-link">
          <code>{inviteLink}</code>
          <button type="button" onClick={copyLink}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {!canManageUsers && (
        <p className="auth-note">Your role can view panel users but not change them.</p>
      )}

      {query.isLoading ? (
        <p>Loading…</p>
      ) : (
        <table className="panel-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {result?.data.map((row) => (
              <tr key={row.id}>
                <td>{row.email}</td>
                <td>
                  <span className={`badge badge-${row.role}`}>
                    {row.role}
                  </span>
                </td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
