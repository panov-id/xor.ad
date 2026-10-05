// Venue envelopes to post (W17-EN), after panel/design/venue-envelopes-mockup.svg
// with the owner's answers: the panel reads them from the node and marks them
// sent (sent_at); a sent one shows no code; the address and the code are
// printed straight on a DL envelope (110 × 220 mm), in English always; only the
// platform prints (providers/access.ts PLATFORM_ONLY, and the node's 403).

import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../components/badge";
import { api } from "../../providers/api";

export interface Envelope {
  id: string;
  venue: string;
  address: string;
  code: string | null;
  ordered_at: number;
  expires_at: number;
  sent_at: number | null;
  attempts_left: number;
  reordered: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayMonth = (s: number) => { const d = new Date(s * 1000); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`; };
const stamp = (s: number) => { const d = new Date(s * 1000); return `${dayMonth(s)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// What goes on the envelope, in English whatever the venue's storefront speaks.
export const EnvelopeFace = ({ envelope, printedAt }: { envelope: Envelope; printedAt: number }) => (
  <section className="envelope-dl" data-testid="envelope-face">
    {/* The return line names the platform only: no postal address of its own is decided yet. */}
    <p className="envelope-from">xor.ad</p>
    <div className="envelope-code">
      <p className="envelope-code-label">Your code</p>
      <p className="envelope-code-value" data-testid="envelope-code">{envelope.code}</p>
      <p className="envelope-note">Enter it in the cabinet within 30 days.</p>
      <p className="envelope-note">Did not order this? Enter it on the «not us» page — the venue is stopped.</p>
      <p className="envelope-printed">printed {dayMonth(printedAt)}</p>
    </div>
    <div className="envelope-to" data-testid="envelope-to">
      <p>{envelope.venue}</p>
      <p>{envelope.address}</p>
    </div>
  </section>
);

export const EnvelopesList = () => {
  const [items, setItems] = useState<Envelope[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Envelope | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api("/admin/envelopes");
      if (r.status === 403) return setError("Envelopes are the platform's to print.");
      if (!r.ok) return setError("The node could not read the envelopes right now.");
      setItems(((await r.json()) as { envelopes: Envelope[] }).envelopes);
      setError(null);
    } catch {
      setError("The node could not be reached.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // The print shows the one envelope only (App.css @media print). The last one
  // printed stays in the page, hidden on screen: printing again, or pressing
  // the browser's own print, gives the same envelope rather than the table.
  useEffect(() => {
    if (printing) window.print();
  }, [printing]);

  const markSent = async (e: Envelope) => {
    setBusy(e.id);
    try {
      const r = await api(`/admin/envelopes/${e.id}/sent`, { method: "POST" });
      if (!r.ok) setError("The envelope could not be marked sent.");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const toPrint = items?.filter((e) => e.sent_at === null).length ?? 0;
  const posted = (items?.length ?? 0) - toPrint;

  return (
    <div className="envelopes">
      <div className="page-head">
        <h1>Envelopes to post</h1>
        <span className="field-hint" data-testid="envelopes-count">{toPrint} to print · {posted} posted</span>
      </div>
      <p className="field-hint">
        Venues that ordered an envelope. The code proves the address: print it, post it, mark it sent. 30 days, then it burns.
      </p>
      {error ? <p className="state state-error" role="alert">{error}</p> : null}
      {items ? (
        <section className="recipients-card envelopes-card">
          <table className="envelopes-table">
            <thead>
              <tr><th>Ordered</th><th>Venue</th><th>Address</th><th>Code</th><th>Burns</th><th aria-hidden="true" /></tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} data-testid="envelope-row" data-id={e.id} data-sent={e.sent_at ? "yes" : "no"} className={e.sent_at ? "muted" : undefined}>
                  <td>{stamp(e.ordered_at)}</td>
                  <td>
                    {e.venue}
                    {e.reordered ? <><br /><Badge tone="warn">second order · the first burnt</Badge></> : null}
                  </td>
                  <td>{e.address}</td>
                  <td>
                    {e.sent_at === null
                      ? <span className="mono" data-testid="envelope-row-code">{e.code}</span>
                      : <>sent {dayMonth(e.sent_at)}<br /><span className="recipients-micro">{e.attempts_left} of 5 tries left</span></>}
                  </td>
                  <td>{dayMonth(e.expires_at)}</td>
                  <td className="envelopes-actions">
                    {e.sent_at === null ? (
                      <>
                        <button type="button" className="button-primary" data-testid="envelope-print" onClick={() => setPrinting({ ...e })}>Print</button>
                        <button type="button" data-testid="envelope-sent" disabled={busy === e.id} onClick={() => void markSent(e)}>Sent</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="recipients-micro envelopes-foot">
            The code stays readable until the envelope is used or burnt (db/068). Once marked sent it is hidden here, to keep it off screens it no longer needs.
          </p>
        </section>
      ) : null}
      {printing ? <div className="envelope-print-area"><EnvelopeFace envelope={printing} printedAt={Math.floor(Date.now() / 1000)} /></div> : null}
    </div>
  );
};
