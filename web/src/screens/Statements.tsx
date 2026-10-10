// The Article 17 statements (dsa/SPEC §7): what was restricted, why, how it
// was decided and what comes next — shown on the first entry into the feed
// while any are unread, as depth/ink does (app.ts), and from "me" after that.
// Words verbatim from depth/ink/locales/ru.json. Kit elements only (K5).

import type { Statement } from "../../../depth/core/client.ts";
import { say } from "../api/me.ts";
import { LANG } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { List } from "../ui/List.tsx";
import { Pair, Pairs } from "../ui/Pair.tsx";
import { Screen } from "../ui/Screen.tsx";

// Dates in the page's language, by the browser (Intl), not always Russian.
const date = (seconds: number) => new Date(seconds * 1000).toLocaleDateString(LANG);

export function Statements({ items, onDone }: { items: Statement[]; onDone: () => void }) {
  const title = say("statements.count", { n: items.length });
  return (
    <Screen name="statements" title={title} data-count={items.length} header={<HeaderScreen title={title} />}>
      <List label={title}>
        {items.map((s) => (
          <Card as="li" key={s.id} data-testid="statement">
            <Pairs>
              <Pair label={say("statements.what")}>{say(`statements.${s.restriction}`)}{s.until ? ` · ${say("statements.until", { date: date(s.until) })}` : ""}</Pair>
              <Pair label={say("statements.why")}>{s.facts}</Pair>
              <Pair label={say("statements.how")}>{s.automated_used ? say("statements.automated") : say("statements.human")}</Pair>
              <Pair label={say("statements.ground")}>{s.ground_kind === "legal" ? say("statements.law") : say("statements.terms")} {s.ground_text}</Pair>
              <Pair label={say("statements.next")}>{say("statements.appeal")}</Pair>
            </Pairs>
            <time className="ui-hint" dateTime={new Date(s.created_at * 1000).toISOString()}>{date(s.created_at)}</time>
          </Card>
        ))}
      </List>
      <Button kind="primary" type="button" icon="check" className="ui-wide" aria-label={say("statements.gotIt")} onClick={onDone} data-testid="statements-ok" />
    </Screen>
  );
}
