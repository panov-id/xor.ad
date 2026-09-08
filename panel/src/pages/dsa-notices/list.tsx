// The Article 16 queue: reports that something here is illegal, oldest first,
// because the one that has waited longest is the one the clock is running on.
//
// Deciding happens on this page rather than a separate one, and deliberately
// cannot be done in one click. Upholding a report restricts somebody's content
// and owes them a written reason — so the form asks for that reason before it
// will send anything. What the moderator writes here is what the author reads.

import { useState } from "react";
import { useList } from "@refinedev/core";
import { Badge } from "../../components/badge";
import { DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/states";
import { api } from "../../providers/api";
import { copyCell, longReason } from "./reasons";

type Notice = {
  id: string;
  // Null means the platform examines it, and there are two ways to get there:
  // the notice arrived with no usable key (db/007), or its copy belongs to a
  // face other than the one it was filed through (db/015, 2026-09-07). Rendering
  // null as an empty badge said neither, and an empty cell in a queue reads as a
  // rendering bug rather than as "this one is ours".
  brand: string | null;
  // The face the notice came through. Only interesting when it differs from
  // `brand` — that is exactly the case the platform is holding.
  received_via: string | null;
  target_kind: string;
  target_id: string | null;
  snapshot: { table?: string; captured_at?: string; row?: Record<string, unknown> } | null;
  reason_text: string;
  notifier_name: string | null;
  notifier_email: string | null;
  status: string;
  snapshot_state: string;
  // Sent by the list endpoint since db/013 (routes/dsa.ts returns the rows as
  // they are). Null on notices older than that migration — a real absence of
  // knowledge, not a missing label.
  snapshot_reason: string | null;
  created_at: string;
  decided_at: string | null;
};

// The same closed set the node accepts (routes/dsa.ts). Article 18 names the
// Member State concerned first; Cyprus or Europol only where that State cannot
// be identified — so the options are worded to make that order visible rather
// than putting the home country at the top out of habit.
const AUTHORITIES = [
  { value: "other_member_state", label: "The Member State concerned — name it below" },
  { value: "cy_police_cybercrime", label: "Cyprus Police — Office for Combating Cybercrime" },
  { value: "europol", label: "Europol" },
];

const RESTRICTIONS = [
  { value: "removed", label: "Removed" },
  { value: "hidden", label: "Hidden" },
  { value: "offer_taken_down", label: "Offer taken down" },
  { value: "access_restricted", label: "Access restricted" },
];

// What the status means to the person reading the queue, rather than to the
// database. "Not accessible" is the one worth spelling out: it is not a failure,
// it is a chat or a surface we could never have copied.
const STATUS_LABEL: Record<string, string> = {
  received: "Waiting",
  in_review: "In review",
  upheld: "Upheld",
  rejected: "Rejected",
};

export const DsaNoticesList = () => {
  const { result, query } = useList<Notice>({
    resource: "dsa_notices",
    pagination: { pageSize: 200 },
  });

  const [open, setOpen] = useState<Notice | null>(null);

  return (
    <div className="panel-card">
      <h1>Illegal-content reports</h1>
      <p className="panel-hint">
        Article 16 notices. A person decides each one, and both sides are written to:
        the reporter learns what was decided, the author learns why their content
        went. The reporter's name is never shown to the author.
      </p>

      <DataTable<Notice>
        columns={[
          {
            key: "created_at",
            label: "Arrived",
            render: (row) => new Date(row.created_at).toLocaleString(),
          },
          {
            key: "brand",
            label: "Queue",
            render: (row) =>
              row.brand
                ? <Badge>{row.brand}</Badge>
                : (
                  <>
                    <Badge>Platform</Badge>
                    {row.received_via
                      ? (
                        <span className="panel-hint">
                          {" "}filed through {row.received_via}
                        </span>
                      )
                      : null}
                  </>
                ),
          },
          {
            key: "target_kind",
            label: "About",
            render: (row) => (
              <>
                {row.target_kind.replace(/_/g, " ")}
                {row.target_id ? <span className="mono"> · {row.target_id.slice(0, 8)}</span> : null}
              </>
            ),
          },
          {
            key: "status",
            label: "State",
            render: (row) => <Badge>{STATUS_LABEL[row.status] ?? row.status}</Badge>,
          },
          {
            key: "snapshot",
            label: "Copy",
            // Whether we hold the content the report is about decides whether it
            // can be examined at all, so it belongs in the list rather than
            // three clicks away — and "no copy" is worth its reason: content that
            // expired before anyone looked is a different problem from content we
            // could never have copied.
            render: (row) =>
              copyCell(Boolean(row.snapshot), row.snapshot_state, row.snapshot_reason),
          },
          {
            key: "id",
            label: "",
            render: (row) => (
              <button type="button" className="btn-quiet" onClick={() => setOpen(row)}>
                {row.decided_at ? "View" : "Examine"}
              </button>
            ),
          },
        ]}
        rows={result?.data ?? []}
        rowId={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? "Loading the reports failed." : null}
        onRetry={() => void query.refetch()}
        caption="Article 16 notices"
        empty={
          <EmptyState
            title="No reports."
            hint="The form on the storefronts writes here, and so does anything sent to support."
          />
        }
      />

      {open ? (
        <NoticeDetail
          notice={open}
          onClose={() => setOpen(null)}
          onDecided={() => {
            setOpen(null);
            void query.refetch();
          }}
        />
      ) : null}
    </div>
  );
};

const NoticeDetail = ({
  notice,
  onClose,
  onDecided,
}: {
  notice: Notice;
  onClose: () => void;
  onDecided: () => void;
}) => {
  const decided = Boolean(notice.decided_at);
  const [decision, setDecision] = useState<"upheld" | "rejected">("rejected");
  const [facts, setFacts] = useState("");
  const [restriction, setRestriction] = useState("removed");
  const [groundKind, setGroundKind] = useState<"legal" | "contractual">("contractual");
  const [groundText, setGroundText] = useState("");
  const [recipient, setRecipient] = useState("");
  // Article 18 lives beside the decision, not inside it: informing police about a
  // person is a different act from deciding what happens to their content, and it
  // can be right whichever way that decision goes — including on a notice that
  // will be rejected.
  const [authority, setAuthority] = useState("");
  const [authorityNote, setAuthorityNote] = useState("");
  const [escalated, setEscalated] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const escalate = async () => {
    setBusy(true);
    setEscalateError(null);
    try {
      const response = await api(`/admin/dsa-notices/${notice.id}/escalate`, {
        method: "POST",
        body: JSON.stringify({ recipient: authority, note: authorityNote || undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setEscalateError(body.error ?? `The record was refused (${response.status}).`);
        return;
      }
      setEscalated(true);
    } catch {
      setEscalateError("The record could not be written.");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api(`/admin/dsa-notices/${notice.id}/decide`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          facts,
          ...(decision === "upheld"
            ? {
                restriction,
                ground_kind: groundKind,
                ground_text: groundText,
                recipient_identity: recipient,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? `The decision was refused (${response.status}).`);
        return;
      }
      onDecided();
    } catch {
      setError("The decision could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-card panel-card--inset">
      <div className="row-between">
        <h2>Report {notice.id.slice(0, 8)}</h2>
        <button type="button" className="btn-quiet" onClick={onClose}>
          Close
        </button>
      </div>

      <dl className="kv">
        <dt>Arrived</dt>
        <dd>{new Date(notice.created_at).toLocaleString()}</dd>
        <dt>About</dt>
        <dd>
          {notice.target_kind.replace(/_/g, " ")}
          {notice.target_id ? ` · ${notice.target_id}` : ""}
        </dd>
        <dt>Reporter</dt>
        <dd>
          {notice.notifier_name || notice.notifier_email
            ? `${notice.notifier_name ?? "—"} · ${notice.notifier_email ?? "no email"}`
            : "Anonymous — a report about children may not be asked for a name"}
        </dd>
        <dt>State</dt>
        <dd>{STATUS_LABEL[notice.status] ?? notice.status}</dd>
      </dl>

      <h3>Why they say it is illegal</h3>
      <p className="quoted">{notice.reason_text}</p>

      <h3>The copy we hold</h3>
      {notice.snapshot ? (
        <pre className="snapshot">{JSON.stringify(notice.snapshot.row ?? notice.snapshot, null, 2)}</pre>
      ) : (
        <p className="panel-hint">
          {longReason(notice.snapshot_reason)}
        </p>
      )}

      <h3>Reported to law enforcement</h3>
      <p className="panel-hint">
        Article 18: where this gives you reason to suspect an offence threatening
        someone's life or safety, inform the authorities now — the obligation is
        immediate and does not wait for the decision below. This form does not
        send anything; it records that you did, so it can be shown later.
      </p>
      {escalated ? (
        <p className="panel-hint">Recorded. The audit log has who, when and to whom.</p>
      ) : (
        <>
          <label className="field">
            <span>Who you informed</span>
            <select value={authority} onChange={(event) => setAuthority(event.target.value)}>
              <option value="">—</option>
              {AUTHORITIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Channel, reference, and — for another Member State — which one
            </span>
            <input
              value={authorityNote}
              onChange={(event) => setAuthorityNote(event.target.value)}
              placeholder="cybercrime@police.gov.cy, ref 2026-…"
            />
          </label>
          {escalateError ? <p className="panel-error">{escalateError}</p> : null}
          <button type="button" onClick={escalate} disabled={busy || !authority}>
            Record the report
          </button>
        </>
      )}

      {decided ? (
        <p className="panel-hint">
          Decided {new Date(notice.decided_at as string).toLocaleString()} — {notice.status}.
        </p>
      ) : (
        <>
          <h3>Decision</h3>
          <div className="seg">
            <button
              type="button"
              className={decision === "rejected" ? "on" : ""}
              onClick={() => setDecision("rejected")}
            >
              Leave it up
            </button>
            <button
              type="button"
              className={decision === "upheld" ? "on" : ""}
              onClick={() => setDecision("upheld")}
            >
              Restrict it
            </button>
          </div>

          <label className="field">
            <span>Facts and circumstances — this is what both letters quote</span>
            <textarea
              value={facts}
              onChange={(event) => setFacts(event.target.value)}
              rows={5}
              placeholder="What you found, and what it rests on. Written for the person it lands on, not for the file."
            />
          </label>

          {decision === "upheld" ? (
            <>
              <label className="field">
                <span>What was done</span>
                <select value={restriction} onChange={(event) => setRestriction(event.target.value)}>
                  {RESTRICTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Ground</span>
                <select
                  value={groundKind}
                  onChange={(event) => setGroundKind(event.target.value as "legal" | "contractual")}
                >
                  <option value="contractual">Breaks our Terms</option>
                  <option value="legal">Illegal under a law</option>
                </select>
              </label>

              <label className="field">
                <span>{groundKind === "legal" ? "Which law, and why it applies" : "Which clause, and why"}</span>
                <textarea
                  value={groundText}
                  onChange={(event) => setGroundText(event.target.value)}
                  rows={3}
                />
              </label>

              <label className="field">
                <span>Whose content it is — identity or email of the author</span>
                <input value={recipient} onChange={(event) => setRecipient(event.target.value)} />
              </label>
            </>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}

          <button type="button" className="btn" disabled={busy || !facts.trim()} onClick={() => void send()}>
            {busy ? "Sending…" : decision === "upheld" ? "Restrict and write to both" : "Refuse and write back"}
          </button>
          <p className="panel-hint">
            Sending writes to the reporter, and — when the content is restricted — to
            its author. Neither letter can be unsent.
          </p>
        </>
      )}
    </div>
  );
};
