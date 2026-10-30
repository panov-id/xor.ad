// w3_likes (sosed Dusk, mobile): what I said "I'm in" to, still alive, newest first — the feed's tiles (feed-card.tsx
// classes) with how far each phrase is from my place. One GET /likes page (client.likes), more by its cursor, as the
// web's Likes; the hand, lit, takes the like back (client.unlike) unless a match came of it (the node answers
// `spent`) or it is a private author's offer (talks-logic.ts canTakeBack). Testids (the web's): liked, liked-card,
// unlike, spent, quiet, more, error; plus likes-back.
// Not as the sheet: no minutes left beside the distance — the node does not give a phrase's start (routes/likes.ts,
// the owner's decision of 24.09.2026), as the feed's tiles have none.
import { useContext, useEffect, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, say } from "../../i18n";
import { storedPlace } from "../../place";
import { NdIcon } from "../../shell/NdIcon";
import { Scene } from "../../shell/Scene";
import { useSkeleton } from "../../shell/loading";
import { TabBar, TabsContext } from "../../shell/TabBar";
import { langOf, offerLabel, textSize } from "../feed-logic";
import { canTakeBack, distanceWord, metresBetween, type LikedRow } from "./talks-logic";

const modeWord = (mode: string): string => {
  const key = `web.mode.${mode}`;
  const word = say(key);
  return word === key ? mode : word;
};

export function Likes({ client, onBack }: { client: Client; onBack: () => void }) {
  const title = say("app.likes.title");
  // the prototype's my-marks (docs/newdesign/proto/my-marks.html, my-marks-empty): the feed's frame with the switch on
  // «marks», the marked phrases as the feed's tiles, the bottom bar
  return (
    <main className="k-screen" data-screen="likes">
      <div className="k-col">
        <Scene>
          <section className="k-panel">
            <div className="k-row">
              <NdIcon name="imin" className="k-pin" />
              <div className="k-stack"><h1 className="k-title">{title}</h1><p className="k-sub">{say("app.likes.sub")}</p></div>
            </div>
          </section>
        </Scene>
        <div className="k-seg" role="tablist">
          <button type="button" role="tab" aria-selected="false" aria-label={say("app.feed.phrases")} onClick={onBack} data-testid="likes-back"><NdIcon name="phrase" /></button>
          <button type="button" role="tab" aria-selected="true" aria-label={title}><NdIcon name="imin" /></button>
        </div>
        <section className="k-body"><LikesBody client={client} /></section>
        <TabBar active="feed" onSelect={useContext(TabsContext)} />
      </div>
    </main>
  );
}

/** The likes list itself: the phone's likes screen holds it, and the desktop feed shows it under its own head (my-marks at 1440/1920). */
export function LikesBody({ client, hint = false }: { client: Client; hint?: boolean }) {
  const [items, setItems] = useState<LikedRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [spent, setSpent] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);
  const place = storedPlace();
  // an answer that lands while the grey cards stand waits behind them (not under 600 ms once shown)
  const skeleton = useSkeleton(items === null && !error);
  const shown = skeleton ? null : items;
  const load = (after?: string) => {
    client.likes(after).then((page) => {
      const got = page.items as unknown as LikedRow[];
      setItems((was) => (after && was ? [...was, ...got] : got));
      setNext(page.next);
    }).catch((e: Error) => setError(failedLine(e)));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const takeBack = (r: LikedRow) => {
    setError(null);
    client.unlike(r.id).then((answer) => {
      if (answer.status === 200 && (answer.body as { state?: string } | null)?.state === "spent") setSpent((was) => ({ ...was, [r.id]: true }));
      else if (answer.status === 200) setItems((was) => (was ?? []).filter((i) => i.id !== r.id));
      else setError(say("web.likes.unlike_failed"));
    }).catch(() => setError(say("web.likes.unlike_failed")));
  };
  const far = (r: LikedRow) => {
    if (r.lat === undefined || r.lon === undefined) return null;
    const d = distanceWord(metresBetween(place, { lat: r.lat, lon: r.lon }));
    return say(d.key, { n: d.n });
  };

  return (
        <>
          {error && <p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p>}
          {skeleton && <div className="k-grid2" data-testid="likes-skeleton" aria-hidden="true"><ul><li className="k-tile k-ghost" /></ul><ul><li className="k-tile k-ghost" /></ul></div>}
          {shown?.length === 0 && (
            <div className="k-empty" data-testid="quiet"><NdIcon name="imin-off" className="k-empty-mark" /><h2>{say("web.likes.empty")}</h2>{hint && <p>{say("app.likes.sub")}</p>}</div>
          )}
          <div className="k-grid2" data-testid="liked">
            {[0, 1].map((col) => (
              <ul key={col}>
                {(shown ?? []).map((r, i) => {
                  if (i % 2 !== col) return null;
                  const open = canTakeBack(r, !!spent[r.id]);
                  const distance = far(r);
                  return (
                    <li key={r.id} className="k-tile" data-testid="liked-card" data-id={r.id} data-accent={r.offer ? "" : undefined}>
                      <div className="k-row k-tile-head">
                        <span className="k-ava" aria-hidden="true"><NdIcon name="me" /></span>
                        <span className="k-meta">{say("app.feed.in_n", { n: r.like_count })}</span>
                      </div>
                      {r.offer
                        ? <span className="k-badge-white k-corner"><NdIcon name="offer" /><span className="k-offer">{offerLabel(r.offer.discount_value)}</span></span>
                        : <span className="k-badge" data-c={String((i % 6) + 1)} aria-hidden="true"><NdIcon name={r.mode === "friends" || r.mode === "party" ? r.mode : "alone"} /></span>}
                      <p className="k-words" lang={langOf(r.lang)} data-size={textSize(r.text)}>{r.text}</p>
                      {distance && <span className="k-meta"><NdIcon name="place" className="k-inline" /> {distance}</span>}
                      {spent[r.id] && <span className="k-meta" data-testid="spent">{say("web.likes.spent")}</span>}
                      <div className="k-foot">
                        <span className="k-meta">{modeWord(r.mode)}</span>
                        <button type="button" className="k-round" aria-pressed="true" data-lit="" aria-label={say("web.likes.unlike")} disabled={!open}
                          onClick={() => takeBack(r)} data-testid="unlike"><NdIcon name="imin" /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
          {next && <button type="button" className="k-btn" onClick={() => load(next)} data-testid="more">{say("liked.more")}</button>}
        </>
  );
}
