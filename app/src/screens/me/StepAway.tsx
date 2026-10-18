// w4_step-away: a break of 20 min, 1 h or 4 h — nothing chosen until one is pressed (§8.2, as the web) — and
// what it costs, counted on the spot (depth/core/me.ts awayCounts): the phrases that come down, who is in on you,
// the talks that wait. "Step away" is shut until a span is chosen; it calls client.stepAway (POST /away).
// Testids (the web's): away-short, away-hour, away-long, away-price, away-go, error.
import { useEffect, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { AWAY_MINUTES, AWAY_ORDER, type AwaySpan } from "@sdk/limits.ts";
import { awayCounts } from "@sdk/me.ts";
import { failedLine, label, say, sayCount } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { hourglass } from "./icons";
import { awayRows } from "./me-logic";
import { ErrorLine, Pairs, SubPage } from "./parts";

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
    <SubPage name="step-away" title={label("away.item")} onBack={onBack}
      foot={
        <button type="button" className="cta cta-primary" aria-disabled={span && !busy ? undefined : true} aria-busy={busy || undefined} onClick={go} data-testid="away-go">
          <Icon d={hourglass} /><span>{label("away.go")}</span>
        </button>
      }>
      <h2 className="me-title">{say("app.stepaway.title")}</h2>
      <p className="me-lead">{say("app.stepaway.sub")}</p>
      <div className="reg-field">
        <label id="away-for">{say("app.stepaway.for")}</label>
        <div className="me-chips" role="radiogroup" aria-labelledby="away-for">
          {AWAY_ORDER.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={span === s} className="me-chip" onClick={() => setSpan(s)} data-testid={`away-${s}`}>
              {say(`app.stepaway.${s}`)}
            </button>
          ))}
        </div>
      </div>
      <Pairs testid="away-price" rows={[
        [say("app.me.phrases"), rows ? sayCount("app.stepaway.come_down", rows.phrases) : "…"],
        [say("app.stepaway.in_on_you"), rows ? say("app.stepaway.neighbours", { n: rows.likes }) : "…"],
        // A talk whose own end comes before the break's ends with it: said beside the ones that wait.
        [say("app.me.talks"), rows ? (rows.end > 0 ? `${sayCount("app.stepaway.wait", rows.wait)} · ${sayCount("app.stepaway.end", rows.end)}` : sayCount("app.stepaway.wait", rows.wait)) : "…"],
      ]} />
      <ErrorLine text={error} />
    </SubPage>
  );
}
