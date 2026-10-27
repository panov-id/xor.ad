// w4_blocked (sosed Dusk, mobile): whom I blocked, as the node keeps it — opaque handles with the day each was set
// ("Neighbour · since 9 Oct"), "Blocked · 1" in the bar, each with "Lift", and the note that a lifted block can't
// be set again (web screens/Blocked.tsx): GET /blocks (client.blocks), DELETE /blocks/:id (client.unblock).
// Opens from Me ("blocked"). Testids: blocked-lift (a block; its row is the Lift button), blocked-empty, blocked-note, error.
import { useEffect, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, LANG, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { type BlockRow, lifted, sinceDay, titled, without } from "./lists-logic";
import { ErrorLine, refusedStatus, SubPage } from "./parts";

export function Blocked({ client, onBack }: { client: Client; onBack: () => void }) {
  const [rows, setRows] = useState<BlockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  useEffect(() => { client.blocks().then(setRows).catch((e: Error) => { setRows([]); setError(failedLine(e)); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function lift(id: string) {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    client.unblock(id)
      .then((answer) => (lifted(answer.status) ? setRows((was) => (was ? without(was, id) : was)) : setError(refusedStatus(answer.status))))
      .catch((e: Error) => setError(failedLine(e)))
      .finally(() => { sending.current = false; });
  }
  const title = rows ? say("app.blocked.title", { n: rows.length }) : titled(label("app.me.blocked"), rows);
  // the prototype's blocked.html: a row per block (the circle with the mark, the words, «Lift» as the round button), then the warning card
  return (
    <SubPage name="blocked" title={title} onBack={onBack} bare>
      {rows && rows.length > 0 && (
        <div className="k-me-rows" data-testid="blocked-list">
          {rows.map((row) => (
            <div className="k-me-row" key={row.id}>
              <span className="k-me-circle" aria-hidden="true"><NdIcon name="block" /></span>
              <span className="k-row-name">{say("app.blocked.since", { date: sinceDay(LANG, row.since) })}</span>
              <button type="button" className="k-round k-me-lift" aria-label={label("blocked.lift")} title={label("blocked.lift")} onClick={() => lift(row.id)} data-testid="blocked-lift"><NdIcon name="refresh" /></button>
            </div>
          ))}
        </div>
      )}
      {rows?.length === 0 && !error && <p className="k-sub k-me-plain" data-testid="blocked-empty">{say("app.blocked.none")}</p>}
      {rows && rows.length > 0 && <div className="k-note k-me-note" role="status" data-testid="blocked-note"><NdIcon name="alert" /><span>{say("app.blocked.note")}</span></div>}
      <ErrorLine text={error} />
    </SubPage>
  );
}
