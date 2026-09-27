// Whom I blocked, as the node keeps it — opaque handles with the day each was
// set, each with "снять" (L1; depth/ink rooms.ts Blocked). Words verbatim
// from depth/ink/locales/ru.json.

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { blockList, type BlockRow, day, unblock } from "../api/lists.ts";
import { say } from "../api/me.ts";

export function Blocked({ client, onBack }: { client: Client; onBack: () => void }) {
  const [rows, setRows] = useState<BlockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => blockList(client).then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="screen blocked-list" data-screen="blocked" data-count={rows?.length ?? ""}>
      <header><h1>{say("blocked.count", { n: rows?.length ?? 0 })}</h1><button type="button" onClick={onBack} data-testid="back">{say("common.back")}</button></header>
      {error && <p className="error" data-testid="error">{error}</p>}
      {rows === null
        ? <p className="muted" data-testid="loading">…</p>
        : (
          <ul className="rows">
            {rows.map((row) => (
              <li key={row.id} data-testid="blocked-row">
                <span>{say("blocked.since", { date: day(row.since) })}</span>
                <button type="button" onClick={() => void unblock(client, row.id).then(load).catch((e: Error) => setError(e.message))} data-testid="blocked-lift">
                  {say("blocked.lift")}
                </button>
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}
