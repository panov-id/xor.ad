// DSA Art. 24(3): the average monthly active recipients over the six calendar
// months before this one, as the node counts it (GET /admin/dsa-recipients,
// relay lib/dsa_recipients.ts). Drawn after panel/design/dsa-recipients-mockup.svg;
// the owner's answers to its four questions (W17-DR) are all "a": an
// incomplete average is shown with its mark, the months keep their bars, the
// figure and its method can be copied, and a tenant has no menu item at all
// (providers/access.ts PLATFORM_ONLY; the node answers 403 to a tenant anyway).

import { useEffect, useState } from "react";
import { api } from "../../providers/api";
import { monthsBack, recipientsText, type Recipients } from "./recipients";

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ");

export const DsaRecipientsList = () => {
  const [data, setData] = useState<Recipients | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api("/admin/dsa-recipients")
      .then(async (r) => {
        if (!live) return;
        if (r.status === 403) return setError("This figure is the platform's. A tenant does not see it.");
        if (!r.ok) return setError("The node could not count right now.");
        setData(await r.json() as Recipients);
      })
      .catch(() => live && setError("The node could not be reached."));
    return () => { live = false; };
  }, []);

  const rows = data ? monthsBack(data.months) : [];
  const top = Math.max(1, ...rows.map((r) => r.active ?? 0));
  const counted = data?.months.length ?? 0;

  const copy = async () => {
    if (!data) return;
    const text = recipientsText(data);
    let done = false;
    try {
      // Only in a secure context; a panel opened over plain http has none.
      await navigator.clipboard.writeText(text);
      done = true;
    } catch {
      // The old way works everywhere a person clicks: a hidden field, selected.
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      done = document.execCommand("copy");
      field.remove();
    }
    setCopied(done ? "Copied" : "Not copied — select the figure by hand");
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="dsa-recipients">
      <div className="page-head">
        <h1>Recipients, DSA Art. 24(3)</h1>
      </div>
      <p className="field-hint">
        The average number of monthly active recipients over the six calendar months before this one —
        the figure the platform publishes.
      </p>
      {error ? <p className="state state-error" role="alert" data-testid="recipients-error">{error}</p> : null}
      {data ? (
        <div className="recipients-grid">
          <div>
            <section className="recipients-card" data-testid="recipients-average">
              <p className="recipients-label">Average, six months</p>
              <p className="recipients-big" data-testid="recipients-figure">
                {data.average === null ? "—" : fmt(data.average)}
              </p>
              {data.complete ? null : (
                <>
                  <p className="recipients-incomplete" data-testid="recipients-incomplete">
                    incomplete · {counted} of 6 months counted
                  </p>
                  <p className="recipients-micro">complete is false until all six months have a row</p>
                </>
              )}
              <button type="button" className="recipients-copy" onClick={copy} data-testid="recipients-copy">
                {copied ?? "Copy the figure and the method"}
              </button>
            </section>
            <p className="recipients-label recipients-how">How it is counted</p>
            <p data-testid="recipients-method">{data.method.charAt(0).toUpperCase() + data.method.slice(1)}.</p>
            <p className="recipients-micro">(the node's method field, quorum of 24.09.2026)</p>
          </div>
          <section className="recipients-card recipients-months" data-testid="recipients-months">
            <table>
              <thead><tr><th>Month</th><th>Active</th><th aria-hidden="true" /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} data-testid="recipients-month" data-counted={r.active === null ? "no" : "yes"}>
                    <td className={r.active === null ? "muted" : undefined}>{r.month}</td>
                    <td className={r.active === null ? "muted" : undefined}>
                      {r.active === null ? "not counted" : fmt(r.active)}
                    </td>
                    <td className="recipients-bar-cell">
                      {r.active === null ? null : <span className="recipients-bar" style={{ width: `${(r.active / top) * 100}%` }} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="recipients-micro">A month with no row is missing, not borrowed from further back.</p>
          </section>
        </div>
      ) : null}
    </div>
  );
};
