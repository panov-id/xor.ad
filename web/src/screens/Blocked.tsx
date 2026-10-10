// Whom I blocked, as the node keeps it — opaque handles with the day each was
// set, each with "снять" (L1; depth/ink rooms.ts Blocked). Words verbatim
// from depth/ink/locales/ru.json. Kit elements only (K5).

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { blockList, type BlockRow, day, unblock } from "../api/lists.ts";
import { say } from "../api/me.ts";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { List, ListItem } from "../ui/List.tsx";
import { Screen } from "../ui/Screen.tsx";

export function Blocked({ client, onBack }: { client: Client; onBack: () => void }) {
  const [rows, setRows] = useState<BlockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => blockList(client).then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const title = say("blocked.count", { n: rows?.length ?? 0 });
  return (
    <Screen name="blocked" title={title} data-count={rows?.length ?? ""} header={<HeaderScreen title={title} onBack={onBack} backLabel={say("common.back")} />}>
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
      {rows === null
        ? <p className="ui-hint" data-testid="loading">…</p>
        : (
          <List label={title}>
            {rows.map((row) => (
              <ListItem
                key={row.id}
                data-testid="blocked-row"
                action={{ label: say("blocked.lift"), testid: "blocked-lift", onSelect: () => void unblock(client, row.id).then(load).catch((e: Error) => setError(e.message)) }}
              >
                {say("blocked.since", { date: day(row.since) })}
              </ListItem>
            ))}
          </List>
        )}
    </Screen>
  );
}
