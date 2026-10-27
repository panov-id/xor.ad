// w4_statements ("Restrictions"): each statement of reasons the node keeps for this identity (client.statements,
// GET /statements; DSA art. 17) — what was restricted and when on a coral card, then what, why, who decided and
// what next; Appeal opens the ways to appeal (statements.appeal: there is no appeal call on the node, the words
// say where to go). The web's Statements, the same call. Testids: statement, statements-appeal, statements-ways.
import { useEffect, useState } from "react";
import type { Client, Statement } from "@sdk/client.ts";
import { capital } from "../../i18n-core";
import { failedLine, LANG, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { dayMonth } from "./me-logic";
import { ErrorLine, SubPage } from "./parts";

export function Statements({ client, onBack }: { client: Client; onBack: () => void }) {
  const [items, setItems] = useState<Statement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ways, setWays] = useState(false);
  useEffect(() => { client.statements().then(setItems).catch((e: Error) => setError(failedLine(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the prototype's statements.html: the alert's mark with what and when, a card per fact (what, why, who decided, what next);
  // the foot: the scales (the ways to appeal) and «Got it»
  const facts = (s: Statement): Array<[string, string, string]> => [
    ["phrase", say("app.statements.what"), s.facts],
    ["info", say("app.statements.why"), s.ground_text],
    ["scale", say("app.statements.decided"), say(s.automated_used ? "app.statements.automatically" : "app.statements.person")],
    ["doc", say("app.statements.next"), say("app.statements.can_appeal")],
  ];
  return (
    <SubPage name="statements" title={say("app.statements.title")} onBack={onBack} panelClass="k-me-panel"
      foot={
        <div className="k-row k-me-two">
          {items && items.length > 0 && (
            <button type="button" className="k-me-round60" aria-label={say("app.statements.appeal")} title={say("app.statements.appeal")} aria-expanded={ways} onClick={() => setWays((w) => !w)} data-testid="statements-appeal"><NdIcon name="scale" /></button>
          )}
          <button type="button" className="cta cta-primary" onClick={onBack} data-testid="statements-ok"><NdIcon name="check" /><span>{say("app.statements.ok")}</span></button>
        </div>
      }>
      {items === null && !error && <p className="k-sub">…</p>}
      {items?.map((s) => (
        <section key={s.id} className="k-me-statement" data-testid="statement">
          <div className="k-row k-me-lead"><NdIcon name="alert" className="k-big-icon" />
            <div className="k-stack"><h2 className="k-title k-wrap">{say("app.statements.head", { date: dayMonth(LANG, new Date(s.created_at * 1000)) })}</h2>
              <p className="k-sub">{say(`app.statements.${s.restriction}`) + (s.until ? ` ${capital(say("statements.until", { date: dayMonth(LANG, new Date(s.until * 1000)) }), LANG)}.` : "")}</p></div></div>
          {facts(s).map(([icon, k, v]) => (
            <div className="k-note k-me-note" key={icon}><NdIcon name={icon} /><div className="k-stack k-gap7"><span className="k-meta">{k}</span><span className="k-me-fact-text">{v}</span></div></div>
          ))}
        </section>
      ))}
      {ways && <p className="k-note k-me-note" data-testid="statements-ways"><NdIcon name="scale" /><span>{capital(say("statements.appeal"), LANG)}.</span></p>}
      <ErrorLine text={error} />
    </SubPage>
  );
}
