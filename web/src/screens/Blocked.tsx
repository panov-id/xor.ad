// Whom I blocked, as the node keeps it — opaque handles with the day each was
// set, each with "снять" (L1; depth/ink rooms.ts Blocked). Words verbatim
// from depth/ink/locales/ru.json.

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { blockList, type BlockRow, day, unblock } from "../api/lists.ts";
import { say } from "../api/me.ts";
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import "./place.css";

export function Blocked({ client, onBack }: { client: Client; onBack: () => void }) {
  const [rows, setRows] = useState<BlockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => blockList(client).then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="screen blocked-list" data-screen="blocked" data-count={rows?.length ?? ""}>
      <HeaderScreen title={say("blocked.count", { n: rows?.length ?? 0 })} onBack={onBack} backLabel={say("common.back")} />
      {error && <p className="error" data-testid="error">{error}</p>}
      {rows === null
        ? <p className="muted" data-testid="loading">…</p>
        : (
          <ul className="place-rows">
            {rows.map((row) => (
              <li key={row.id} data-testid="blocked-row">
                <span className="place-row-text">{say("blocked.since", { date: day(row.since) })}</span>
                <Button kind="text" type="button" onClick={() => void unblock(client, row.id).then(load).catch((e: Error) => setError(e.message))} data-testid="blocked-lift">
                  {say("blocked.lift")}
                </Button>
              </li>
            ))}
          </ul>
        )}
    </main>
  );
}
