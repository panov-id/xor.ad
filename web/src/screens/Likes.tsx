// "Liked" (§4.10, depth's Liked screen): what I liked that is still alive,
// newest first, thirty at a time by cursor. A liked phrase leaves the feed,
// so this is where a like is taken back from — unless a match came of it: the
// node answers `spent`, and a private author's offer cannot be taken back at
// all. A phrase that became a match leads to the inbox, which the web face
// does not have yet: it is named, not linked. Kit elements only (K6a).

import { offerLabel } from "../ui/offer.ts";
import { useEffect, useState } from "react";
import type { Client, Liked } from "../../../depth/core/client.ts";
import { likedPhrases, unlikePhrase } from "../api/actions.ts";
import { LANG, say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Card, LikeCount } from "../ui/Card.tsx";
import { EmptyState } from "../ui/Notices.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Screen } from "../ui/Screen.tsx";

export function Likes({ client, onBack }: { client: Client; onBack: () => void }) {
  const [items, setItems] = useState<Liked[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [spent, setSpent] = useState<Record<string, true>>({});

  async function load(after?: string) {
    setState("loading");
    try {
      const page = await likedPhrases(client, after);
      setItems((was) => (after ? [...was, ...page.items] : page.items));
      setNext(page.next);
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("failed");
    }
  }
  useEffect(() => { void load(); }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  async function takeBack(item: Liked) {
    const outcome = await unlikePhrase(client, item.id);
    if (outcome === "unliked") setItems((was) => was.filter((i) => i.id !== item.id));
    else if (outcome === "spent") setSpent((was) => ({ ...was, [item.id]: true }));
    else setError(say("web.likes.unlike_failed"));
  }

  const when = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString(LANG, { hour: "2-digit", minute: "2-digit" });

  const title = say("web.likes.title");
  return (
    <Screen name="likes" title={title} header={<HeaderScreen title={title} onBack={onBack} backLabel={say("web.likes.back")} />}>
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
      {state === "ready" && items.length === 0 && (
        <EmptyState title={say("web.likes.empty")} line={say("web.likes.empty_hint")} data-testid="quiet" />
      )}
      <ul className="ui-cards" data-testid="liked">
        {items.map((item) => (
          <Card as="li" key={item.id} of="phrase" data-testid="liked-card" data-id={item.id}>
            {item.offer && <span className="ui-offer">{offerLabel(item.offer.discount_value)}</span>}
            <p>{item.text}</p>
            <span className="ui-hint">
              <LikeCount n={item.like_count} lit /> · {when(item.liked_at)}
              {item.state === "matched" ? say("web.likes.matched") : ""}
            </span>
            {item.state === "liked" && !item.offer && !spent[item.id] && (
              <Button type="button" icon="close" aria-label={say("web.likes.unlike")} onClick={() => takeBack(item)} data-testid="unlike" />
            )}
            {spent[item.id] && <span className="ui-hint" data-testid="spent">{say("web.likes.spent")}</span>}
          </Card>
        ))}
      </ul>
      {state === "loading" && <p className="ui-hint" data-testid="loading">…</p>}
      {next && state === "ready" && <Button type="button" icon="expand" className="ui-wide" aria-label={say("liked.more")} onClick={() => load(next)} data-testid="more" />}
    </Screen>
  );
}
