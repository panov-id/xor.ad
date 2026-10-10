// The phrases I hid, newest first, each with "вернуть" (L1; depth/ink
// rooms.ts Hidden): a returned phrase is back in my feed while it is alive.
// Words verbatim from depth/ink/locales/ru.json. Kit elements only (K5).

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { hiddenList, type HiddenRow, unhide } from "../api/lists.ts";
import { say } from "../api/me.ts";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { List, ListItem } from "../ui/List.tsx";
import { EmptyState } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";

export function Hidden({ client, onBack }: { client: Client; onBack: () => void }) {
  const [rows, setRows] = useState<HiddenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => hiddenList(client).then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const title = say("hidden.title");
  return (
    <Screen name="hidden" title={title} header={<HeaderScreen title={title} onBack={onBack} backLabel={say("common.back")} />}>
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
      {rows === null
        ? <p className="ui-hint" data-testid="loading">…</p>
        : rows.length === 0
        ? <EmptyState title={say("hidden.empty")} data-testid="hidden-empty" />
        : (
          <List label={title}>
            {rows.map((row) => (
              <ListItem
                key={row.id}
                data-testid="hidden-row"
                action={{ label: say("hidden.restore"), testid: "hidden-restore", onSelect: () => void unhide(client, row.id).then(load).catch((e: Error) => setError(e.message)) }}
              >
                {row.text}
              </ListItem>
            ))}
          </List>
        )}
    </Screen>
  );
}
