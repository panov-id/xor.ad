// w4_hidden (sosed Dusk, mobile): the phrases I hid, newest first, "Hidden · 2" in the bar, each with "Return"
// (what the web's Hidden does, web screens/Hidden.tsx): GET /hidden (client.hidden), DELETE /hidden/:id
// (client.unhide). A returned phrase is back in my feed while it is alive. Opens from Me ("hidden").
// Testids: hidden-restore (a phrase; its row is the Return button), hidden-empty, hidden-hint, error.
import { useEffect, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, say } from "../../i18n";
import { type HiddenRow, lifted, titled, without } from "./lists-logic";
import { NdIcon } from "../../shell/NdIcon";
import { textSize } from "../feed-logic";
import { ErrorLine, refusedStatus, SubPage } from "./parts";

const KIND_ICON: Record<string, string> = { alone: "alone", company: "friends", friends: "friends", party: "party" };
const KIND_COLOUR: Record<string, number> = { alone: 1, company: 2, friends: 2, party: 5 };

export function Hidden({ client, onBack }: { client: Client; onBack: () => void }) {
  const [rows, setRows] = useState<HiddenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  useEffect(() => { client.hidden().then(setRows).catch((e: Error) => { setRows([]); setError(failedLine(e)); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function bringBack(id: string) {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    client.unhide(id)
      .then((answer) => (lifted(answer.status) ? setRows((was) => (was ? without(was, id) : was)) : setError(refusedStatus(answer.status))))
      .catch((e: Error) => setError(failedLine(e)))
      .finally(() => { sending.current = false; });
  }
  const title = rows ? say("app.hidden.title", { n: rows.length }) : titled(label("web.feed.hidden"), rows);
  // the prototype's hidden.html: two columns of the phrases' tiles (the author's circle, the mode's badge, the words), «Return» as the round button at the foot
  return (
    <SubPage name="hidden" title={title} onBack={onBack} bare>
      {rows && rows.length > 0 && (
        <div className="k-me-cards" data-testid="hidden-list">
          {rows.map((row) => (
            <article className="k-tile k-me-card" key={row.id}>
              <span className="k-ava" aria-hidden="true"><NdIcon name="me" /></span>
              <span className="k-badge" data-c={KIND_COLOUR[row.kind] ?? 2} aria-hidden="true"><NdIcon name={KIND_ICON[row.kind] ?? "phrase"} /></span>
              <p className="k-words k-me-words" data-size={textSize(row.text)}>{row.text}</p>
              <div className="k-foot k-me-foot">
                <button type="button" className="k-round" aria-label={label("web.feed.hidden_undo")} title={label("web.feed.hidden_undo")} onClick={() => bringBack(row.id)} data-testid="hidden-restore"><NdIcon name="refresh" /></button>
              </div>
            </article>
          ))}
        </div>
      )}
      {rows?.length === 0 && !error && <p className="k-sub k-me-plain" data-testid="hidden-empty">{label("hidden.empty")}</p>}
      {rows && rows.length > 0 && <p className="k-sub k-me-plain" data-testid="hidden-hint">{say("app.hidden.hint")}</p>}
      <ErrorLine text={error} />
    </SubPage>
  );
}
