// The Article 17 statements (dsa/SPEC §7): what was restricted, why, how it
// was decided and what comes next — shown on the first entry into the feed
// while any are unread, as depth/ink does (app.ts), and from "me" after that.
// Words verbatim from depth/ink/locales/ru.json.

import type { Statement } from "../../../depth/core/client.ts";
import { say } from "../api/me.ts";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import "./place.css";

const date = (seconds: number) => new Date(seconds * 1000).toLocaleDateString("ru-RU");

export function Statements({ items, onDone }: { items: Statement[]; onDone: () => void }) {
  return (
    <main className="screen statements" data-screen="statements" data-count={items.length}>
      <HeaderScreen title={say("statements.count", { n: items.length })} />
      <ul className="place-cards">
        {items.map((s) => (
          <Card as="li" key={s.id} className="place-statement" data-testid="statement">
            <p><span className="place-label">{say("statements.what")}</span> {say(`statements.${s.restriction}`)}{s.until ? ` · ${say("statements.until", { date: date(s.until) })}` : ""}</p>
            <p><span className="place-label">{say("statements.why")}</span> {s.facts}</p>
            <p><span className="place-label">{say("statements.how")}</span> {s.automated_used ? say("statements.automated") : say("statements.human")}</p>
            <p><span className="place-label">{say("statements.ground")}</span> {s.ground_kind === "legal" ? say("statements.law") : say("statements.terms")} {s.ground_text}</p>
            <p><span className="place-label">{say("statements.next")}</span> {say("statements.appeal")}</p>
            <span className="place-meta">{date(s.created_at)}</span>
          </Card>
        ))}
      </ul>
      <Button kind="primary" type="button" icon="check" className="ui-wide" aria-label={say("statements.gotIt")} onClick={onDone} data-testid="statements-ok" />
    </main>
  );
}
