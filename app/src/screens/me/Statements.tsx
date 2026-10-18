// w4_statements ("Restrictions"): each statement of reasons the node keeps for this identity (client.statements,
// GET /statements; DSA art. 17) — what was restricted and when on a coral card, then what, why, who decided and
// what next; Appeal opens the ways to appeal (statements.appeal: there is no appeal call on the node, the words
// say where to go). The web's Statements, the same call. Testids: statement, statements-appeal, statements-ways.
import { useEffect, useState } from "react";
import type { Client, Statement } from "@sdk/client.ts";
import { capital } from "../../i18n-core";
import { failedLine, LANG, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { flag } from "../../shell/icons";
import { dayMonth } from "./me-logic";
import { Banner, ErrorLine, Pairs, SubPage } from "./parts";

export function Statements({ client, onBack }: { client: Client; onBack: () => void }) {
  const [items, setItems] = useState<Statement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ways, setWays] = useState(false);
  useEffect(() => { client.statements().then(setItems).catch((e: Error) => setError(failedLine(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <SubPage name="statements" title={say("app.statements.title")} onBack={onBack}>
      {items === null && !error && <p className="me-quiet">…</p>}
      {items?.map((s) => (
        <section key={s.id} className="me-statement" data-testid="statement">
          <Banner tone="coral" icon={flag} title={say("app.statements.head", { date: dayMonth(LANG, new Date(s.created_at * 1000)) })}
            text={say(`app.statements.${s.restriction}`) + (s.until ? ` ${capital(say("statements.until", { date: dayMonth(LANG, new Date(s.until * 1000)) }), LANG)}.` : "")} />
          <Pairs rows={[
            [say("app.statements.what"), s.facts, "prose"],
            [say("app.statements.why"), s.ground_text, "prose"],
            [say("app.statements.decided"), say(s.automated_used ? "app.statements.automatically" : "app.statements.person")],
            [say("app.statements.next"), say("app.statements.can_appeal")],
          ]} />
        </section>
      ))}
      {items && items.length > 0 && (
        <>
          <button type="button" className="cta cta-quiet me-appeal" aria-expanded={ways} onClick={() => setWays((w) => !w)} data-testid="statements-appeal">
            <Icon d={flag} /><span>{say("app.statements.appeal")}</span>
          </button>
          {ways && <p className="me-quiet" data-testid="statements-ways">{capital(say("statements.appeal"), LANG)}.</p>}
        </>
      )}
      <ErrorLine text={error} />
    </SubPage>
  );
}
