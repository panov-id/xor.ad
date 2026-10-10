// "Столы" (kit_RU.md §8.4, К6б): the tables near the person, one tab of the
// bottom bar. There is no list endpoint: the node gives tables as cards of
// kind "table" in GET /feed (relay lib/tables_feed.ts, the first page only), so
// this reads the same feed in the same circle and keeps those cards. A card
// sits the person down as on the feed (App.enterTable); "new table" is the same
// flow as the feed's (NewTable.tsx). Kit elements only.

import { useEffect, useRef, useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Card, CardOpen, LikeCount, openerIds } from "../ui/Card.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { EmptyState } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";
import type { FeedCard } from "./Feed.tsx";

export function TableList(
  { client, at, radius, onTable, onNewTable, notice }: {
    client: Client;
    at: { lat: number; lon: number };
    radius: Radius;
    onTable: (id: string) => void;
    onNewTable: () => void;
    // A refusal to seat, said here as on the feed.
    notice?: string | null;
  },
) {
  const [items, setItems] = useState<FeedCard[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    client.feed({ ...at, radius })
      .then((page) => {
        if (!live.current) return;
        setItems((page.items as FeedCard[]).filter((card) => card.kind === "table"));
        setState("ready");
      })
      .catch((e: Error) => {
        if (!live.current) return;
        setError(e.message);
        setState("failed");
      });
    return () => { live.current = false; };
  }, [client, radius]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = say("web.tables.title");
  return (
    <Screen name="tables" title={title} header={
      <HeaderScreen
        title={title}
        action={<Button type="button" kind="primary" icon="table" aria-label={say("web.feed.newTable")} onClick={onNewTable} data-testid="new-table" />}
      />
    }>
      {state === "failed" && <ErrorLine data-testid="error">{error}</ErrorLine>}
      {notice && <ErrorLine data-testid="table-refused">{notice}</ErrorLine>}
      {state === "ready" && items.length === 0 && (
        <EmptyState
          title={say("web.tables.empty")}
          line={say("web.tables.empty_hint")}
          action={{ label: say("web.feed.newTable"), onSelect: onNewTable }}
          data-testid="quiet"
        />
      )}
      <ul className="ui-cards" data-testid="tables">
        {items.map((card) => (
          <Card as="li" key={card.id} kind="nested" of="table" data-testid="table-card" data-id={card.id}>
            <CardOpen id={card.id} onOpen={() => onTable(card.id)} />
            <p id={openerIds(card.id).text}>{say("table.title")}{card.name ? ` · «${card.name}»` : ""} · {card.game} {card.set}</p>
            <span className="ui-hint" id={openerIds(card.id).foot}>{say("table.playing")} {card.playing ?? 0} · {say("table.watching")} {card.watching ?? 0} · {say("web.feed.tableFree", { n: card.free_seats ?? 0 })} · <LikeCount n={card.like_count ?? 0} /></span>
          </Card>
        ))}
      </ul>
      {state === "loading" && <p className="ui-hint" data-testid="loading">…</p>}
    </Screen>
  );
}
