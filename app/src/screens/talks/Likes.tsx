// w3_likes (sosed Dusk, mobile): what I said "I'm in" to, still alive, newest first — the feed's tiles (feed-card.tsx
// classes) with how far each phrase is from my place. One GET /likes page (client.likes), more by its cursor, as the
// web's Likes; the hand, lit, takes the like back (client.unlike) unless a match came of it (the node answers
// `spent`) or it is a private author's offer (talks-logic.ts canTakeBack). Testids (the web's): liked, liked-card,
// unlike, spent, quiet, more, error; plus likes-back.
// Not as the sheet: no minutes left beside the distance — the node does not give a phrase's start (routes/likes.ts,
// the owner's decision of 24.09.2026), as the feed's tiles have none.
import { useEffect, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, say } from "../../i18n";
import { storedPlace } from "../../place";
import { Icon } from "../../shell/Icon";
import { chevronLeft, hand } from "../../shell/icons";
import { Screen } from "../../shell/Screen";
import { pin } from "../me/icons";
import { langOf, offerLabel, toneOf, type FeedCard } from "../feed-logic";
import { canTakeBack, distanceWord, metresBetween, type LikedRow } from "./talks-logic";

const modeWord = (mode: string): string => {
  const key = `web.mode.${mode}`;
  const word = say(key);
  return word === key ? mode : word;
};

export function Likes({ client, onBack }: { client: Client; onBack: () => void }) {
  const [items, setItems] = useState<LikedRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [spent, setSpent] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);
  const place = storedPlace();
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

  const title = say("app.likes.title");
  return (
    <Screen name="likes" title={title} className="me-sub tk">
      <header className="me-bar">
        <button type="button" className="me-back" aria-label={label("common.back")} onClick={onBack} data-testid="likes-back"><Icon d={chevronLeft} /></button>
        <h1>{title}</h1>
      </header>
      <p className="tk-lead">{say("app.likes.sub")}</p>
      <div className="tk-sheet tk-likes">
        {error && <p className="me-error" role="alert" data-testid="error">{error}</p>}
        {items?.length === 0 && <p className="tk-quiet" data-testid="quiet">{say("web.likes.empty")}</p>}
        <ul className="tk-cards" data-testid="liked">
          {(items ?? []).map((r, i) => {
            const open = canTakeBack(r, !!spent[r.id]);
            const distance = far(r);
            return (
              <li key={r.id} className={`fd-card fd-${toneOf(r as unknown as FeedCard, i)}`} data-testid="liked-card" data-id={r.id}>
                {r.offer && <span className="fd-offer">{offerLabel(r.offer.discount_value)}</span>}
                <p className="fd-open tk-phrase" lang={langOf(r.lang)}>{r.text}</p>
                <button type="button" className="fd-hand" data-lit="" aria-pressed="true" aria-label={say("web.likes.unlike")} disabled={!open}
                  onClick={() => takeBack(r)} data-testid="unlike">
                  <Icon d={hand} />
                </button>
                {distance && <p className="tk-meta"><Icon d={pin} /><span>{distance}</span></p>}
                {spent[r.id] && <p className="tk-meta" data-testid="spent">{say("web.likes.spent")}</p>}
                <div className="fd-foot">
                  <span className="fd-in"><Icon d={hand} /><span>{say("app.feed.in_n", { n: r.like_count })} · {say("app.feed.you_too")}</span></span>
                  <span className="fd-mode">{modeWord(r.mode)}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {next && <button type="button" className="tk-more" onClick={() => load(next)} data-testid="more">{say("liked.more")}</button>}
      </div>
    </Screen>
  );
}
