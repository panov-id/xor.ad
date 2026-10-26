// w4_hidden (sosed Dusk, mobile): the phrases I hid, newest first, "Hidden · 2" in the bar, each with "Return"
// (what the web's Hidden does, web screens/Hidden.tsx): GET /hidden (client.hidden), DELETE /hidden/:id
// (client.unhide). A returned phrase is back in my feed while it is alive. Opens from Me ("hidden").
// Testids: hidden-restore (a phrase; its row is the Return button), hidden-empty, hidden-hint, error.
import { useEffect, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, say } from "../../i18n";
import { type HiddenRow, lifted, titled, without } from "./lists-logic";
import { ErrorLine, refusedStatus, Row, SubPage } from "./parts";

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
  return (
    <SubPage name="hidden" title={title} onBack={onBack}>
      {rows && rows.length > 0 && (
        <div className="me-rows" data-testid="hidden-list">
          {rows.map((row) => <Row key={row.id} text={row.text} value={label("web.feed.hidden_undo")} testid="hidden-restore" onOpen={() => bringBack(row.id)} />)}
        </div>
      )}
      {rows?.length === 0 && !error && <p className="me-quiet" data-testid="hidden-empty">{label("hidden.empty")}</p>}
      {rows && rows.length > 0 && <p className="me-quiet" data-testid="hidden-hint">{say("app.hidden.hint")}</p>}
      <ErrorLine text={error} />
    </SubPage>
  );
}
