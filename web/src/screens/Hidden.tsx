// The phrases I hid, newest first, each with "вернуть" (L1; depth/ink
// rooms.ts Hidden): a returned phrase is back in my feed while it is alive.
// Words verbatim from depth/ink/locales/ru.json.

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { hiddenList, type HiddenRow, unhide } from "../api/lists.ts";
import { say } from "../api/me.ts";

export function Hidden({ client, onBack }: { client: Client; onBack: () => void }) {
  const [rows, setRows] = useState<HiddenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => hiddenList(client).then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="screen hidden-list" data-screen="hidden">
      <header><h1>{say("hidden.title")}</h1><button type="button" onClick={onBack} data-testid="back">{say("common.back")}</button></header>
      {error && <p className="error" data-testid="error">{error}</p>}
      {rows === null
        ? <p className="muted" data-testid="loading">…</p>
        : rows.length === 0
        ? <p className="muted" data-testid="hidden-empty">{say("hidden.empty")}</p>
        : (
          <ul className="rows">
            {rows.map((row) => (
              <li key={row.id} data-testid="hidden-row">
                <span>{row.text}</span>
                <button type="button" onClick={() => void unhide(client, row.id).then(load).catch((e: Error) => setError(e.message))} data-testid="hidden-restore">
                  {say("hidden.restore")}
                </button>
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}
