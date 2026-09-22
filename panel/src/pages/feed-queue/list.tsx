// The feed queue: phrases waiting for a verdict before anybody sees them (chat
// spec §8.3). No moderating model is wired (§8.14), so a person reads each one
// here and says publish or refuse — and the name beside it goes out with the
// same verdict (§8.2, owner's decision of 2026-09-22).
//
// The queue is ten minutes deep at most: a phrase nobody decides by then is
// swept, unread, and the author's slot frees. So the page re-reads itself every
// fifteen seconds while it is on screen (the decision of 2026-09-22 against a
// refresh button, which would lose the phrase that arrived after the click),
// and the waiting time turns amber past eight minutes.
//
// Refuse asks once more, in place. Publish does not: a published phrase can be
// taken down through the DSA queue, a refused one is deleted and nothing brings
// it back.

import { useEffect, useState } from "react";
import { useList } from "@refinedev/core";
import { Badge } from "../../components/badge";
import { DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/states";
import { api } from "../../providers/api";

type Waiting = {
  id: string;
  brand: string;
  text: string;
  mode: string;
  name: string;
  // "gone": the author closed their identity while the phrase waited.
  name_state: "accepted" | "pending" | "rejected" | "gone";
  waiting_seconds: number;
};

export const REFRESH_EVERY_MS = 15_000;
// moderation.queue.wait is 10 minutes (docs/facts/limits.tsv); amber from 8.
export const QUEUE_WAIT_S = 600;
export const AMBER_FROM_S = 480;

export const waitingLabel = (seconds: number): string =>
  `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;

export const isAlmostSwept = (seconds: number): boolean => seconds >= AMBER_FROM_S;

export const FeedQueueList = () => {
  const { result, query } = useList<Waiting>({
    resource: "feed_queue",
    pagination: { pageSize: 200 },
    queryOptions: { refetchInterval: REFRESH_EVERY_MS, refetchIntervalInBackground: false },
  });
  const rows = result?.data ?? [];

  // The row whose Refuse was pressed once; a second press sends.
  const [arming, setArming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The refetch replaces the rows underneath an armed Refuse; if the row went
  // (decided elsewhere, or swept), the arming goes with it.
  useEffect(() => {
    if (arming && !rows.some((row) => row.id === arming)) setArming(null);
  }, [arming, rows]);

  const decide = async (row: Waiting, verdict: "publish" | "refuse" | "refuse-name") => {
    setBusy(row.id);
    setError(null);
    try {
      // Publish names the name it is accepting; the node refuses if it moved.
      const response = await api(`/admin/feed-queue/${row.id}/${verdict}`, {
        method: "POST",
        ...(verdict === "refuse" ? {} : { body: JSON.stringify({ name: row.name }) }),
      });
      if (response.status === 409) {
        // Decided by somebody else, swept, or the name moved under the read:
        // in every case the refetch below shows what is true now.
      } else if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? `The verdict was refused (${response.status}).`);
        return;
      }
      setArming(null);
      await query.refetch();
    } catch {
      setError("The verdict could not be sent.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel-card">
      <div className="page-head">
        <h1>Feed queue</h1>
        <span className="field-hint" aria-live="polite">
          refreshes every {REFRESH_EVERY_MS / 1000} s · {rows.length} waiting
        </span>
      </div>
      <p className="field-hint">
        Phrases waiting for a verdict. Nobody sees a phrase until it is published; one
        nobody decides in {QUEUE_WAIT_S / 60} minutes is swept. Publishing accepts the name
        that goes out with it. The author's identity is not shown here and is not sent
        to the panel at all.
      </p>

      {error ? <p className="state state-error" role="alert">{error}</p> : null}

      <DataTable<Waiting>
        columns={[
          {
            key: "waiting_seconds",
            label: "Waiting",
            render: (row) => (
              <span className={isAlmostSwept(row.waiting_seconds) ? "waiting text-warn" : "waiting"}>
                {waitingLabel(row.waiting_seconds)}
              </span>
            ),
          },
          { key: "brand", label: "Queue", render: (row) => <Badge>{row.brand}</Badge> },
          {
            key: "name",
            label: "Name",
            // One flex line, so the badge stays beside the name in the stacked
            // layout at 390 px too, where a bare fragment let it drift.
            render: (row) => (
              <span className="row-actions">
                {row.name}
                {row.name_state === "pending" ? <Badge tone="warn">name unchecked</Badge> : null}
                {row.name_state === "rejected" ? <Badge tone="danger">name rejected</Badge> : null}
                {row.name_state === "gone" ? <Badge>author gone</Badge> : null}
              </span>
            ),
          },
          { key: "text", label: "Phrase", render: (row) => row.text },
          { key: "mode", label: "Mode", render: (row) => <span className="text-muted">{row.mode}</span> },
          {
            key: "id",
            label: "",
            render: (row) =>
              arming === row.id
                ? (
                  <span className="row-actions">
                    <span className="text-muted">Refuse for good?</span>{" "}
                    <button
                      type="button"
                      className="button-danger-filled"
                      disabled={busy === row.id}
                      onClick={() => void decide(row, "refuse")}
                    >
                      Yes, refuse
                    </button>
                  </span>
                )
                : (
                  <span className="row-actions">
                    <button
                      type="button"
                      className="button-primary"
                      disabled={busy === row.id || row.name_state === "rejected"}
                      title={row.name_state === "rejected" ? "The name is refused; the phrase waits for a new one." : undefined}
                      onClick={() => void decide(row, "publish")}
                    >
                      Publish
                    </button>{" "}
                    <button
                      type="button"
                      className="button-danger"
                      disabled={busy === row.id}
                      onClick={() => setArming(row.id)}
                    >
                      Refuse
                    </button>
                    {row.name_state === "rejected" || row.name_state === "gone" ? null : (
                      // The name, not the phrase: the phrase stays and waits
                      // for a new name (§8.2). One press — nothing is deleted.
                      <button
                        type="button"
                        className="button-danger"
                        disabled={busy === row.id}
                        onClick={() => void decide(row, "refuse-name")}
                      >
                        Refuse name
                      </button>
                    )}
                  </span>
                ),
          },
        ]}
        rows={rows}
        rowId={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? "Loading the queue failed." : null}
        onRetry={() => void query.refetch()}
        empty={
          <EmptyState
            title="Nothing is waiting."
            hint="A phrase appears here the moment it is sent."
          />
        }
      />
    </div>
  );
};
