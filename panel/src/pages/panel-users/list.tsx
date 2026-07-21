import { useList, useGetIdentity } from "@refinedev/core";
import { useState } from "react";
import { api } from "../../providers/api";

type PanelUserRow = {
  id: string;
  email: string;
  role: "admin" | "moderator";
  created_at: string;
};

type Identity = { role: "admin" | "moderator" | null };

export const PanelUsersList = () => {
  // useGetIdentity returns a TanStack UseQueryResult, so the identity is on
  // `data` (unlike useList below, which is Refine's own { result, query }).
  const { data: identity } = useGetIdentity<Identity>();
  const { result, query } = useList<PanelUserRow>({
    resource: "panel_users",
    sorters: [{ field: "created_at", order: "desc" }],
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "moderator">("moderator");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = identity?.role === "admin";

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

      {isAdmin && (
        <form onSubmit={onInvite} className="auth-form panel-invite-form">
          <input
            type="email"
            placeholder="email to invite"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "moderator")}>
            <option value="moderator">moderator</option>
            <option value="admin">admin</option>
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
      {!isAdmin && <p className="auth-note">Only admins can invite new panel users.</p>}

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
                  <span className={`badge ${row.role === "admin" ? "badge-admin" : "badge-moderator"}`}>
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
