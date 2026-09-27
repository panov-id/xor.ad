// The Article 17 statements (dsa/SPEC §7): what was restricted, why, how it
// was decided and what comes next — shown on the first entry into the feed
// while any are unread, as depth/ink does (app.ts), and from "me" after that.
// Words verbatim from depth/ink/locales/ru.json.

import type { Statement } from "../../../depth/core/client.ts";
import { say } from "../api/me.ts";

const date = (seconds: number) => new Date(seconds * 1000).toLocaleDateString("ru-RU");

export function Statements({ items, onDone }: { items: Statement[]; onDone: () => void }) {
  return (
    <main className="screen statements" data-screen="statements" data-count={items.length}>
      <header><h1>{say("statements.count", { n: items.length })}</h1></header>
      <ul className="cards">
        {items.map((s) => (
          <li key={s.id} className="card" data-testid="statement">
            <p><strong>{say("statements.what")}</strong> {say(`statements.${s.restriction}`)}{s.until ? ` · ${say("statements.until", { date: date(s.until) })}` : ""}</p>
            <p><strong>{say("statements.why")}</strong> {s.facts}</p>
            <p><strong>{say("statements.how")}</strong> {s.automated_used ? say("statements.automated") : say("statements.human")}</p>
            <p><strong>{say("statements.ground")}</strong> {s.ground_kind === "legal" ? say("statements.law") : say("statements.terms")} {s.ground_text}</p>
            <p><strong>{say("statements.next")}</strong> {say("statements.appeal")}</p>
            <span className="muted">{date(s.created_at)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={onDone} data-testid="statements-ok">{say("statements.gotIt")}</button>
    </main>
  );
}
