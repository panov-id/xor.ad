// "Столы" (kit_RU.md §8.4, К6б): the tables near the person, one tab of the
// bottom bar. GET /tables in the feed's circle, thirty at a time and more by
// cursor (П18; relay lib/tables_feed.ts) — it used to keep the table cards of
// the feed's first page, so with a long feed some tables never showed. Above
// the list, «Мои столы»: where the person sits and what they liked, wherever
// those stand (П18b; the list leaves them out, as the feed does). A card
// sits the person down as on the feed (App.enterTable); "new table" is the same
// flow as the feed's (NewTable.tsx). Kit elements only.

import { useEffect, useRef, useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { classWord, setWord } from "../api/tables.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Card, CardOpen, LikeCount, openerIds } from "../ui/Card.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { EmptyState } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";
import { TileFoot } from "../ui/TileFoot.tsx";
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
  const [mine, setMine] = useState<(FeedCard & { seated?: boolean; liked?: boolean })[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const live = useRef(true);
  const load = (after?: string) => {
    setState("loading");
    client.tables({ ...at, radius, after })
      .then((page) => {
        if (!live.current) return;
        const cards = page.items as FeedCard[];
        setItems((had) => after ? [...had, ...cards] : cards);
        if (!after) setMine((page.mine ?? []) as typeof mine);
        setNext(page.next);
        setState("ready");
      })
      .catch((e: Error) => {
        if (!live.current) return;
        setError(e.message);
        setState("failed");
      });
  };
  useEffect(() => {
    live.current = true;
    load();
    return () => { live.current = false; };
  }, [client, radius]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = say("web.tables.title");
  return (
    <Screen name="tables" title={title} header={
      <HeaderScreen
        title={title}
        action={<Button type="button" icon="table" aria-label={say("web.feed.newTable")} onClick={onNewTable} data-testid="new-table" />}
      />
    }>
      {state === "failed" && <ErrorLine data-testid="error">{error}</ErrorLine>}
      {notice && <ErrorLine data-testid="table-refused">{notice}</ErrorLine>}
      {mine.length > 0 && (
        <section aria-labelledby="tables-mine" data-testid="tables-mine">
          <h2 id="tables-mine">{say("web.tables.mine")}</h2>
          <ul className="ui-cards">
            {mine.map((card) => (
              <Card as="li" key={card.id} kind="nested" of="table" data-testid="table-mine" data-id={card.id}>
                <CardOpen id={`mine-${card.id}`} onOpen={() => onTable(card.id)} />
                <p id={openerIds(`mine-${card.id}`).text}>{say("table.title")}{card.name ? ` · «${card.name}»` : ""} · {classWord(card.game ?? "")} · {setWord(card.set ?? "")}</p>
                <TileFoot id={openerIds(`mine-${card.id}`).foot} items={[
                  { icon: "player", n: card.playing ?? 0, label: `${say("table.playing")} ${card.playing ?? 0}` },
                  { icon: "eye", n: card.watching ?? 0, label: `${say("table.watching")} ${card.watching ?? 0}` },
                ]}>
                  <LikeCount n={card.like_count ?? 0} />
                  {/* where the person stands at this table: said in words — no icon names «sit here» or «liked» on its own */}
                  {card.seated && <span>{say("web.tables.seated")}</span>}
                  {card.liked && <span>{say("web.tables.liked")}</span>}
                </TileFoot>
              </Card>
            ))}
          </ul>
        </section>
      )}
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
            <p id={openerIds(card.id).text}>{say("table.title")}{card.name ? ` · «${card.name}»` : ""} · {classWord(card.game ?? "")} · {setWord(card.set ?? "")}</p>
            <TileFoot id={openerIds(card.id).foot} items={[
              { icon: "player", n: card.playing ?? 0, label: `${say("table.playing")} ${card.playing ?? 0}` },
              { icon: "eye", n: card.watching ?? 0, label: `${say("table.watching")} ${card.watching ?? 0}` },
              { icon: "seat", n: card.free_seats ?? 0, label: say("web.feed.tableFree", { n: card.free_seats ?? 0 }) },
            ]}><LikeCount n={card.like_count ?? 0} /></TileFoot>
          </Card>
        ))}
      </ul>
      {next && state === "ready" && (
        <Button type="button" icon="expand" className="ui-wide" aria-label={say("liked.more")} onClick={() => load(next)} data-testid="more" />
      )}
      {state === "loading" && <p className="ui-hint" data-testid="loading">…</p>}
    </Screen>
  );
}
