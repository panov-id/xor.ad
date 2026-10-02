// A phrase full-screen (the card of screen 03's sheet, depth's full-screen
// card): the text large, the mode and the language under it, and
// the three things one can do with somebody else's phrase — like (§8.4), hide
// it from one's own feed (§8.9), block its author (§8.9). A like that meets a
// like becomes a match and says so; hiding and blocking take the card away
// and lead back to the feed. Blocking asks twice and names the consequence,
// as the terminal does.

import type { Client } from "../../../depth/core/client.ts";
import { modes } from "../api/actions.ts";
import { type CardLogic, useCard } from "./logic/useCard.ts";
import { Button } from "../ui/Button.tsx";
import { LikeBurst } from "../ui/Card.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import type { FeedCard } from "./Feed.tsx";
import { say } from "../locales/say.ts";

export function Card(
  { client, card, onBack, onGone }: {
    client: Client;
    card: FeedCard;
    onBack: () => void;
    // The card left the viewer's feed — hidden, or its author blocked.
    onGone: (why: "hidden" | "blocked", id: string) => void;
  },
) {
  const logic = useCard({ client, card, onGone });
  const { like, busy, doLike, hide } = logic;

  return (
    <main className="screen card-screen" data-screen="card" data-id={card.id}>
      {/* Sheet 23: close on the left, the phrase's mode in words on the band. */}
      <HeaderScreen title={modes().find((m) => m.value === card.mode)?.label ?? card.mode} onBack={onBack} backLabel={say("web.card.back")} />
      <article className="phrase">
        {card.offer && <span className="offer" data-testid="offer">−{card.offer.discount_value}</span>}
        <p className="big" data-testid="text">{card.text}</p>
        {card.offer?.conditions && <p className="muted" data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
        <p className="muted card-likes">
          <LikeBurst count={card.like_count + (like && like.state !== "refused" ? 1 : 0)} on={like !== null && like.state !== "refused"}
            data-testid="like-burst" />
          {card.soon ? say("web.card.soon") : ""}
        </p>
      </article>
      <CardNotes logic={logic} />
      <div className="actions ui-icon-row card-actions">
        <Button
          type="button"
          kind="primary"
          icon="like"
          aria-label={say("web.card.like")}
          disabled={busy || (like !== null && like.state !== "refused")}
          onClick={() => void doLike()}
          data-testid="like"
        />
        <Button
          type="button"
          icon="hide"
          aria-label={say("feed.hide")}
          disabled={busy}
          onClick={() => void hide()}
          data-testid="hide"
        />
        <CardExtras card={card} logic={logic} />
      </div>
    </main>
  );
}

// What the node said to the last action on the card: liked, matched, a
// refusal, an error. Shared by every brand's CardView.
export function CardNotes({ logic }: { logic: CardLogic }) {
  const { like, error } = logic;
  return (
    <>
      {like?.state === "liked" && <p className="warn" data-testid="liked">{say("web.card.liked")}</p>}
      {like?.state === "matched" && <p className="warn" data-testid="matched">{say("web.card.matched")}</p>}
      {like?.state === "refused" && <p className="error" data-testid="refused">{like.why}</p>}
      {error && <p className="error" data-testid="error">{error}</p>}
    </>
  );
}

// The card's rarer actions, the same for every brand: the venue offer's
// complaint, the report on its link, the block asked twice.
export function CardExtras({ card, logic }: { card: FeedCard; logic: CardLogic }) {
  const {
    busy, block, confirmBlock, setConfirmBlock, complaining, setComplaining, email, setEmail, text, setText,
    complained, complain, linkCode, report, reportLink,
  } = logic;
  return (
    <>
      {card.kind === "offer" && (complained
        ? <p data-testid="complained">{say("web.card.complained")}</p>
        : !complaining
        ? <Button type="button" icon="report" aria-label={say("web.card.complain")} disabled={busy} onClick={() => setComplaining(true)} data-testid="complain" />
        : (
          <section className="confirm" data-testid="complain-form">
            <label>
              {say("web.card.complain_email")}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="complain-email" autoComplete="email" />
            </label>
            <label>
              {say("web.card.complain_text")}
              <textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} data-testid="complain-text" />
            </label>
            <div className="ui-icon-row">
              <Button kind="primary" type="button" icon="send" aria-label={say("web.card.complain_send")} disabled={busy || !email.includes("@")} onClick={() => void complain()} data-testid="complain-send" />
              <Button kind="secondary" type="button" icon="close" aria-label={say("web.card.cancel")} onClick={() => setComplaining(false)} />
            </div>
          </section>
        ))}
      {linkCode && (report === "sent"
        ? <p className="offer-toast" role="status" data-testid="reported">{say("web.offer.reported")}</p>
        : (
          <Button type="button" icon="link" aria-label={say("web.offer.wrong")} disabled={busy || report === "sending"} onClick={() => void reportLink()} data-testid="report" />
        ))}
      {report === "failed" && <p className="error" data-testid="report-failed">{say("web.offer.later")}</p>}
      {!confirmBlock
        ? (
          <Button type="button" icon="block" aria-label={say("block.item")} disabled={busy} onClick={() => setConfirmBlock(true)} data-testid="block" />
        )
        : (
          <section className="confirm" data-testid="block-confirm">
            <p className="muted">{say("web.card.block_warning")}</p>
            <div className="ui-icon-row">
              <Button
                type="button"
                kind="danger"
                icon="block"
                aria-label={say("web.card.block_yes")}
                disabled={busy}
                onClick={() => void block()}
                data-testid="block-confirm-yes"
              />
              <Button type="button" icon="close" aria-label={say("web.card.block_no")} onClick={() => setConfirmBlock(false)} data-testid="block-confirm-no" />
            </div>
          </section>
        )}
    </>
  );
}
