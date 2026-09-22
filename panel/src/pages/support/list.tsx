// Support, the team's side (protocol §4.10a; mock-up
// panel/design/support-queue-mockup.svg, accepted as drawn on 2026-09-22).
//
// Waiting requests first, and those written from a session frozen by the PIN
// limit on top, marked: a frozen session may be the owner locked out of a taken
// identity. The answer is a field in the row; sending it lights the person's
// dot on screen 14 again. The author's identity is not shown — the node does
// not send it.
//
// Not here: "ask them to file a complaint" (a request that is really an
// Article 16 notice). The team cannot give the notifier's good-faith statement;
// the button answers with a link to the report form, and that text is the
// owner's to write.

import { useState } from "react";
import { useCan, useList } from "@refinedev/core";
import { Badge } from "../../components/badge";
import { DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/states";
import { api } from "../../providers/api";

type Request = {
  id: string;
  public_no: string;
  brand: string | null;
  created_at: number;
  body: string;
  email: string | null;
  from_frozen: boolean;
  answer: string | null;
  answered_at: number | null;
};

// support.answer.length (docs/facts/limits.tsv): the node counts graphemes.
export const ANSWER_MAX = 4000;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const answerLength = (text: string): number => [...graphemes.segment(text.trim())].length;

export const SupportList = () => {
  const { result, query } = useList<Request>({ resource: "support", pagination: { pageSize: 200 } });
  const rows = result?.data ?? [];
  const { data: answerAccess } = useCan({ resource: "support", action: "answer" });
  const mayAnswer = answerAccess?.can === true;

  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const waiting = rows.filter((r) => r.answer === null).length;
  const frozen = rows.filter((r) => r.answer === null && r.from_frozen).length;

  const send = async (row: Request) => {
    setBusy(true);
    setError(null);
    try {
      const response = await api(`/admin/support/${row.id}/answer`, {
        method: "POST",
        body: JSON.stringify({ answer: draft }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? `The answer was refused (${response.status}).`);
        return;
      }
      setOpen(null);
      setDraft("");
      await query.refetch();
    } catch {
      setError("The answer could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-card">
      <div className="page-head">
        <h1>Support</h1>
        <span className="field-hint">{waiting} waiting · {frozen} from a frozen session</span>
      </div>
      <p className="field-hint">
        Requests people wrote from screen 14. Waiting ones first. The author's identity is not
        shown and not sent to the panel.
      </p>
      {error ? <p className="state state-error" role="alert">{error}</p> : null}
      <DataTable<Request>
        columns={[
          { key: "created_at", label: "Written", render: (r) => new Date(r.created_at * 1000).toLocaleString() },
          { key: "public_no", label: "Number", render: (r) => <span className="mono">{r.public_no}</span> },
          { key: "brand", label: "Queue", render: (r) => <Badge>{r.brand ?? "platform"}</Badge> },
          {
            key: "body",
            label: "Request",
            render: (r) => (
              <>
                {r.body}
                {r.from_frozen && r.answer === null
                  ? <>{" "}<Badge tone="warn">frozen session — read first</Badge></>
                  : null}
                {r.answer !== null
                  ? <div className="text-muted">answered {r.answered_at ? new Date(r.answered_at * 1000).toLocaleString() : ""}: {r.answer}</div>
                  : null}
                {open === r.id
                  ? (
                    <div className="support-answer">
                      <textarea
                        aria-label="Answer"
                        placeholder="Answer — the person sees it on screen 14, and the dot lights again"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                      />
                      <div className="row-actions">
                        <span className="field-hint">{answerLength(draft)}/{ANSWER_MAX}</span>
                        <button type="button" className="btn-quiet" onClick={() => { setOpen(null); setDraft(""); }}>Cancel</button>
                        <button
                          type="button"
                          className="button-primary"
                          disabled={busy || answerLength(draft) === 0 || answerLength(draft) > ANSWER_MAX}
                          onClick={() => void send(r)}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  )
                  : null}
              </>
            ),
          },
          { key: "email", label: "Email", render: (r) => <span className="text-muted">{r.email ?? "—"}</span> },
          {
            key: "id",
            label: "",
            render: (r) =>
              mayAnswer && open !== r.id
                ? (
                  <button type="button" className="button-primary" onClick={() => { setOpen(r.id); setDraft(""); }}>
                    {r.answer === null ? "Answer" : "Answer again"}
                  </button>
                )
                : null,
          },
        ]}
        rows={rows}
        rowId={(r) => r.id}
        loading={query.isLoading}
        error={query.isError ? "Loading the requests failed." : null}
        onRetry={() => void query.refetch()}
        empty={<EmptyState title="No requests." hint="A request appears here the moment someone sends it from screen 14." />}
      />
    </div>
  );
};
