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
import { gameById, type TableCard } from "@sdk/new_table.ts";
import { label, say } from "../../i18n";
import { storedPlace } from "../../place";
import { Icon } from "../../shell/Icon";
import { flag, map, refresh } from "../../shell/icons";
import { useSkeleton } from "../../shell/loading";
import { Screen } from "../../shell/Screen";
import { Skeleton } from "../../shell/Skeleton";
import { type Tab, TabBar } from "../../shell/TabBar";
import { die, plus } from "./icons";
import { apart, mergeTables, START_GAMES, TABLES_RADIUS, toneAt } from "./tables-logic";
import { gameName, lineOf, TableRow } from "./table-row";

export function Tables({ client, onTab, onNewTable, onTable }: { client: Client; onTab: (tab: Tab) => void; onNewTable: (game?: string) => void; onTable?: (id: string) => void }) {
  const place = useRef(storedPlace()).current;
  const [items, setItems] = useState<TableCard[]>([]);
  const [mine, setMine] = useState<TableCard[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const live = useRef(true);
  const skeleton = useSkeleton(state === "loading");
  async function load(after?: string) {
    setState("loading");
    try {
      const page = await client.tables({ lat: place.lat, lon: place.lon, radius: TABLES_RADIUS, after });
      if (!live.current) return;
      setItems((was) => mergeTables(was, page.items as TableCard[], after));
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

  const list = apart(items, mine);
  const title = label("web.tables.title");
  return (
    <Screen name="tables" title={title} className="tb">
      <header className="tb-head">
        <span className="word">sosed</span>
        <h1>{title}</h1>
        <p className="tb-sub">{say("app.tables.sub")}</p>
      </header>
      <div className="tb-sheet">
        <div className="tb-body">
          <button type="button" className="cta cta-primary tb-new" onClick={() => onNewTable()} data-testid="new-table"><Icon d={plus} /><span>{label("web.newTable.title")}</span></button>

          {state === "failed" && (
            <div className="fd-fail" data-testid="error">
              <div className="fd-banner" role="alert">
                <Icon d={flag} />
                <div><strong>{say("app.feed.err_title")}</strong><p>{say("app.tables.err_body")}</p></div>
              </div>
              <button type="button" className="cta cta-quiet" onClick={() => void load()} data-testid="retry"><Icon d={refresh} /><span>{say("app.feed.retry")}</span></button>
            </div>
          )}

          {mine.length > 0 && (
            <section className="tb-mine" aria-labelledby="tables-mine" data-testid="tables-mine">
              <h2 id="tables-mine">{label("web.tables.mine")}</h2>
              <ul className="tb-list">
                {mine.map((card, i) => {
                  const line = lineOf(card);
                  return (
                    <TableRow key={card.id} id={card.id} tone={toneAt(i)} title={line.title} testid="table-mine"
                      meta={[line.meta, card.seated && say("web.tables.seated"), card.liked && say("web.tables.liked")].filter(Boolean).join(" · ")}
                      onWatch={onTable && (() => onTable(card.id))} />
                  );
                })}
              </ul>
            </section>
          )}

          {state === "ready" && list.length === 0 && mine.length === 0 && (
            <div className="fd-empty" data-testid="quiet">
              <span className="fd-empty-icon" aria-hidden="true"><Icon d={map} /></span>
              <h2>{say("web.tables.empty")}</h2>
              <p>{say("web.tables.empty_hint")}</p>
            </div>
          )}

          {/* «Playing now» names the list on the wide sheets (tablet_834_Tables, desktop_1440_Tables); the phone's sheet has no such head */}
          {list.length > 0 && <h2 className="tb-playing" data-testid="tables-playing">{say("app.tables.playing")}</h2>}
          <ul className="tb-list" data-testid="tables">
            {list.map((card, i) => {
              const line = lineOf(card);
              return <TableRow key={card.id} id={card.id} tone={toneAt(i)} title={line.title} meta={line.meta} testid="table-card" onWatch={onTable && (() => onTable(card.id))} />;
            })}
          </ul>
          {state === "loading" && skeleton && <div className="fd-skeletons" data-testid="loading"><Skeleton kind="card" /><Skeleton kind="card" /></div>}
          {/* «Start a game» (the wide sheets only): six games, a tap opens the wizard with the game picked */}
          <section className="tb-start" aria-labelledby="tables-start" data-testid="tables-start">
            <h2 id="tables-start">{say("app.tables.start")}</h2>
            <ul>
              {START_GAMES.map((id, i) => (
                <li key={id}>
                  <button type="button" className={`tb-game tb-${toneAt(i)}`} onClick={() => onNewTable(id)} data-testid={`start-${id}`}>
                    <Icon d={die} /><span>{label(gameName(gameById(id)!))}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {next && state === "ready" && <button type="button" className="cta cta-quiet" onClick={() => void load(next)} data-testid="more">{say("app.feed.more_cards")}</button>}
        </div>
      </div>
      <TabBar active="tables" onSelect={onTab} />
    </Screen>
  );
}
