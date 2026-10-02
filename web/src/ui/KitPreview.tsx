// The kit on one page, in the stand's build only (VITE_STAND=1, /kit):
// what the e2e spec kit.spec.ts drives — the Info balloon, the icon set, the
// like burst — before any screen wears them. Not reachable in a real build.
import { useState } from "react";
import { say } from "../locales/say.ts";
import { Button } from "./Button.tsx";
import { Card, LikeBurst } from "./Card.tsx";
import { Chip } from "./Chip.tsx";
import { HeaderFeed } from "./Header.tsx";
import { ICONS } from "./Icon.tsx";
import { Info } from "./Info.tsx";

export function KitPreview() {
  const [liked, setLiked] = useState(false);
  return (
    <main className="screen" data-screen="kit">
      <HeaderFeed place={say("web.feed.title")} step="" />
      <div className="actions" data-testid="icons">
        {ICONS.map((name) => <Button key={name} icon={name} aria-label={name} type="button" />)}
      </div>
      <Info label={say("web.info")} data-testid="info">
        <p>{say("web.card.liked")}</p>
        <Button type="button" kind="text">{say("common.back")}</Button>
      </Info>
      <ul className="cards">
        <Card as="li"><Chip label={say("web.feed.title")} /><p>{say("web.card.liked")}</p>
          <LikeBurst count={liked ? 4 : 3} on={liked} data-testid="kit-burst" /></Card>
        <Card as="li"><p>{say("web.card.matched")}</p></Card>
      </ul>
      <Button type="button" kind="primary" icon="like" aria-label={say("web.card.like")} onClick={() => setLiked(true)} data-testid="kit-like" />
    </main>
  );
}
