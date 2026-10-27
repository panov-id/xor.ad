// w4_step-away: a break of 20 min, 1 h or 4 h — nothing chosen until one is pressed (§8.2, as the web) — and
// what it costs, counted on the spot (depth/core/me.ts awayCounts): the phrases that come down, who is in on you,
// the talks that wait. "Step away" is shut until a span is chosen; it calls client.stepAway (POST /away).
// Testids (the web's): away-short, away-hour, away-long, away-price, away-go, error.
import { useEffect, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { AWAY_MINUTES, AWAY_ORDER, type AwaySpan } from "@sdk/limits.ts";
import { awayCounts } from "@sdk/me.ts";
import { failedLine, label, say, sayCount } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { awayRows } from "./me-logic";
import { ErrorLine, SubPage } from "./parts";

export function StepAway({ client, onGone, onBack }: { client: Client; onGone: (until: number) => void; onBack: () => void }) {
  const [span, setSpan] = useState<AwaySpan | null>(null);
  const [counts, setCounts] = useState<{ phrases: number; likes: number; ends: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { awayCounts(client).then(setCounts).catch((e: Error) => setError(failedLine(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = counts ? awayRows(counts, AWAY_MINUTES[span ?? "short"], Math.floor(Date.now() / 1000)) : null;
  const go = () => {
    if (!span || busy) return;
    setBusy(true);
    setError(null);
    client.stepAway(span).then(onGone).catch((e: Error) => { setBusy(false); setError(failedLine(e)); });
  };
  return (
    <SubPage name="step-away" title={label("away.item")} onBack={onBack} panelClass="k-me-panel"
      foot={
        <button type="button" className="cta cta-primary" aria-disabled={span && !busy ? undefined : true} aria-busy={busy || undefined} onClick={go} data-testid="away-go">
          <NdIcon name="door" /><span>{label("away.go")}</span>
        </button>
      }>
      <h2 className="k-sr">{say("app.stepaway.title")}</h2>
      <p className="k-sr">{say("app.stepaway.sub")}</p>
      <div className="k-me-three k-me-spans" role="radiogroup" aria-label={say("app.stepaway.for")}>
        {AWAY_ORDER.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={span === s} className="k-me-span" onClick={() => setSpan(s)} data-testid={`away-${s}`}>
            <span className="k-badge" data-c="5" aria-hidden="true"><NdIcon name="clock" /></span><span className="k-row-name">{say(`app.stepaway.${s}`)}</span>
          </button>
        ))}
      </div>
      <dl className="k-me-costs" data-testid="away-price">
        <div><NdIcon name="phrase" /><dt className="k-sr">{say("app.me.phrases")}</dt><dd>{rows ? sayCount("app.stepaway.come_down", rows.phrases) : "…"}</dd></div>
        <div><NdIcon name="imin" /><dt>{say("app.stepaway.in_on_you")}</dt><dd>{rows ? sayCount("app.stepaway.neighbours", rows.likes) : "…"}</dd></div>
        {/* A talk whose own end comes before the break's ends with it: said beside the ones that wait. */}
        <div><NdIcon name="talks" /><dt className="k-sr">{say("app.me.talks")}</dt><dd>{rows ? (rows.end > 0 ? `${sayCount("app.stepaway.wait", rows.wait)} · ${sayCount("app.stepaway.end", rows.end)}` : sayCount("app.stepaway.wait", rows.wait)) : "…"}</dd></div>
      </dl>
      <ErrorLine text={error} />
    </SubPage>
  );
}
