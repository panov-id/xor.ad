// "Tables" (sosed Dusk w3_tables): the tables near the person, the second tab of the bar. GET /tables in the circle,
// thirty at a time and more by cursor (web screens/TableList.tsx, П18) through the SDK the unlock seated (client.tables):
// above the list «My tables» — where the person sits and what they liked, wherever those stand (П18b; the list leaves them
// out). The testids are the web's: new-table, tables, table-card, tables-mine, table-mine, quiet, error, more, loading;
// new ones: retry.
//
// Not here yet: the search in the header; the red dot on the chats tab; the table itself (w3_table-*): a row's «Watch» is
// drawn and shut (aria-disabled) until `onTable` is given — nothing opens from it.
import { useEffect, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { GAMES, gameById, gameOfTable, type TableCard } from "@sdk/new_table.ts";
import { label, say } from "../../i18n";
import { storedPlace } from "../../place";
import { useSkeleton } from "../../shell/loading";
import { NdIcon } from "../../shell/NdIcon";
import { Screen } from "../../shell/Screen";
import { Skeleton } from "../../shell/Skeleton";
import { type Tab, TabBar } from "../../shell/TabBar";
import { useEvery } from "../move-parts";
import { apart, freshTables, mergeTables, START_GAMES, TABLES_LOOK_MS, TABLES_RADIUS } from "./tables-logic";
import { gameIcon, gameName, lineOf, TableTile } from "./table-row";

export function Tables({ client, onTab, onNewTable, onTable }: { client: Client; onTab: (tab: Tab) => void; onNewTable: (game?: string) => void; onTable?: (id: string) => void }) {
  const place = useRef(storedPlace()).current;
  const [items, setItems] = useState<TableCard[]>([]);
  const [mine, setMine] = useState<TableCard[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [tab, setTab] = useState<"all" | "mine">("all");   // the list first; the person's own tables (tables-mine) are the second tab
  const [filter, setFilter] = useState<string | null>(null);   // a game of the strip: only its tables
  const live = useRef(true);
  const paged = useRef(false);   // a page after the cursor is drawn: the quiet look keeps it
  const skeleton = useSkeleton(state === "loading");
  async function load(after?: string) {
    setState("loading");
    try {
      const page = await client.tables({ lat: place.lat, lon: place.lon, radius: TABLES_RADIUS, after });
      if (!live.current) return;
      setItems((was) => mergeTables(was, page.items as TableCard[], after));
      paged.current = !!after;
      if (!after) setMine((page.mine ?? []) as TableCard[]);
      setNext(page.next ?? null);
      setState("ready");
    } catch {
      if (!live.current) return;
      setState("failed");
    }
  }
  useEffect(() => {
    live.current = true;
    void load();
    return () => { live.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the quiet look while the list is open and seen: no skeleton, a failed look keeps what is drawn
  useEvery(TABLES_LOOK_MS, () => document.hidden ? undefined : client.tables({ lat: place.lat, lon: place.lon, radius: TABLES_RADIUS }).then((page) => {
    if (!live.current) return;
    setItems((was) => freshTables(was, page.items as TableCard[], paged.current));
    setMine((page.mine ?? []) as TableCard[]);
  }).catch(() => {}), state === "ready");

  const ofGame = (c: TableCard) => !filter || gameOfTable(c.game, c.set)?.id === filter;
  const list = apart(items, mine).filter(ofGame);
  const own = mine.filter(ofGame);
  const showMine = mine.length > 0 && tab === "mine";
  const title = label("web.tables.title");
  const nothing = state === "ready" && items.length === 0 && mine.length === 0;
  return (
    <Screen name="tables" title={title} className="k-screen">
      <div className="k-col">
        <section className="k-panel">
          <div className="k-row">
            <NdIcon name="tables" className="k-pin" />
            <div className="k-stack"><h1 className="k-title">{title}</h1><p className="k-sub">{say("app.tables.sub")}</p></div>
            <button type="button" className="k-tb-add" aria-label={label("web.newTable.title")} onClick={() => onNewTable()} data-testid="new-table"><NdIcon name="plus" /></button>
          </div>
        </section>
        <div className="k-tb-games" role="group" aria-label={say("app.tables.games")}>
          {GAMES.map((g) => (
            <button key={g.id} type="button" className="k-tb-game" aria-pressed={filter === g.id} aria-label={label(gameName(g))}
              onClick={() => setFilter(filter === g.id ? null : g.id)} data-testid={`filter-${g.id}`}><NdIcon name={gameIcon(g.id)} /></button>
          ))}
        </div>
        {mine.length > 0 && (
          <div className="k-seg" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "all"} aria-label={say("app.tables.all")} onClick={() => setTab("all")} data-testid="tables-tab-all"><NdIcon name="nearby" /></button>
            <button type="button" role="tab" aria-selected={tab === "mine"} aria-label={label("web.tables.mine")} onClick={() => setTab("mine")} data-testid="tables-tab-mine"><NdIcon name="me" /></button>
          </div>
        )}
        {nothing ? (
          <section className="k-body" data-testid="quiet">
            <div className="k-tb-empty">
              <span className="k-tb-hero"><NdIcon name="tables" /></span>
              <h2>{say("web.tables.empty")}</h2>
              <p>{say("web.tables.empty_hint")}</p>
              <button type="button" className="k-cta" data-outline="" data-fit="" onClick={() => onNewTable()} data-testid="new-table-empty"><NdIcon name="plus" /><span>{label("web.newTable.title")}</span></button>
            </div>
          </section>
        ) : (
          <section className="k-body">
            {state === "failed" && (
              <div className="k-note" data-tone="error" data-testid="error">
                <NdIcon name="wifi-off" /><span role="alert">{say("app.tables.err_body")}</span>
                <button type="button" className="k-btn" onClick={() => void load()} data-testid="retry"><NdIcon name="refresh" /><span>{say("app.feed.retry")}</span></button>
              </div>
            )}
            {mine.length > 0 && (
              <ul className="k-grid2 k-tb-grid" hidden={!showMine} aria-label={label("web.tables.mine")} data-testid="tables-mine">
                {own.map((card) => {
                  const line = lineOf(card);
                  return <TableTile key={card.id} id={card.id} card={card} title={line.title} testid="table-mine" mine={!!card.seated} onOpen={onTable && (() => onTable(card.id))} />;
                })}
              </ul>
            )}
            {list.length > 0 && <h2 hidden data-testid="tables-playing">{say("app.tables.playing")}</h2>}
            {(
              <ul className="k-grid2 k-tb-grid" hidden={showMine} data-testid="tables">
                {list.map((card) => <TableTile key={card.id} id={card.id} card={card} title={lineOf(card).title} testid="table-card" onOpen={onTable && (() => onTable(card.id))} />)}
              </ul>
            )}
            {state === "loading" && skeleton && <div className="k-grid2" data-testid="loading"><div className="k-tile k-ghost" /><div className="k-tile k-ghost" /></div>}
            {next && state === "ready" && !showMine && <button type="button" className="k-btn" onClick={() => void load(next)} data-testid="more">{say("app.feed.more_cards")}</button>}
          </section>
        )}
        {/* «Start a game» (the wide sheets only; hidden on the phone): six games, a tap opens the wizard with the game picked */}
        <section className="tb-start" aria-labelledby="tables-start" data-testid="tables-start">
          <h2 id="tables-start">{say("app.tables.start")}</h2>
          <ul>
            {START_GAMES.map((id) => (
              <li key={id}><button type="button" onClick={() => onNewTable(id)} data-testid={`start-${id}`}><NdIcon name={gameIcon(id)} /><span>{label(gameName(gameById(id)!))}</span></button></li>
            ))}
          </ul>
        </section>
        <TabBar active="tables" onSelect={onTab} />
      </div>
    </Screen>
  );
}
