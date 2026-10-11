// A phrase full-screen (the card of screen 03's sheet, depth's full-screen
// card): the text large, the mode and the language under it, and
// the three things one can do with somebody else's phrase — like (§8.4), hide
// it from one's own feed (§8.9), block its author (§8.9). A like that meets a
// like becomes a match and says so; hiding and blocking take the card away
// and lead back to the feed. Blocking asks twice and names the consequence,
// as the terminal does. Kit elements only (K6a).

import type { Client } from "../../../depth/core/client.ts";
import { languageIn, modes } from "../api/actions.ts";
import { type CardLogic, useCard } from "./logic/useCard.ts";
import { Button } from "../ui/Button.tsx";
import { LikeBurst } from "../ui/Card.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { Field, FieldGroup } from "../ui/Field.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Actions } from "../ui/Links.tsx";
import { Notice } from "../ui/Notices.tsx";
import { StatusInline } from "../ui/Status.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Confirm } from "../ui/Sheet.tsx";
import { Textarea } from "../ui/Textarea.tsx";
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
  const mode = modes().find((m) => m.value === card.mode)?.label ?? card.mode;
  const language = languageIn(card.lang);

  return (
    <Screen
      name="card"
      title={say("web.card.phrase")}
      data-id={card.id}
      /* Sheet 23: close on the left, the phrase's mode in words on the band. */
      header={<HeaderScreen title={say("web.card.phrase")} onBack={onBack} backLabel={say("web.card.back")} />}
    >
      <article className="ui-phrase">
        {card.offer && <span className="ui-offer" data-testid="offer">−{card.offer.discount_value}</span>}
        <p className="ui-big" data-testid="text">{card.text}</p>
        <p className="ui-hint" data-testid="mode">{mode}</p>
        {card.offer?.conditions && <p className="ui-hint" data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
        {language && <p className="ui-hint" lang={card.lang}>{language}</p>}
        <p className="ui-card-likes">
          <LikeBurst count={card.like_count + (like && like.state !== "refused" ? 1 : 0)} on={like !== null && like.state !== "refused"}
            data-testid="like-burst" />
          {card.soon ? <span className="ui-hint">{say("web.card.soon")}</span> : null}
        </p>
      </article>
      <CardNotes logic={logic} />
      <Actions>
        <Button
          type="button"
          icon="hide"
          aria-label={say("feed.hide")}
          disabled={busy}
          onClick={() => void hide()}
          data-testid="hide"
        />
        <CardExtras card={card} logic={logic} />
        <Button
          type="button"
          kind="primary"
          icon="like"
          aria-label={say("web.card.like")}
          disabled={busy || (like !== null && like.state !== "refused")}
          onClick={() => void doLike()}
          data-testid="like"
          data-lit={like !== null && like.state !== "refused" ? "" : undefined}
          aria-pressed={like !== null && like.state !== "refused"}
        />
      </Actions>
    </Screen>
  );
}

// What the node said to the last action on the card: liked, matched, a
// refusal, an error. Shared by every brand's CardView.
export function CardNotes({ logic }: { logic: CardLogic }) {
  const { like, error } = logic;
  return (
    <>
      {like?.state === "liked" && <StatusInline data-testid="liked">{say("web.card.liked")}</StatusInline>}
      {like?.state === "liked" && like.namePending && (
        <Notice data-testid="like-name-pending">{say("like.namePending")}</Notice>
      )}
      {like?.state === "matched" && <StatusInline data-testid="matched">{say("web.card.matched")}</StatusInline>}
      {like?.state === "refused" && <ErrorLine data-testid="refused">{like.why}</ErrorLine>}
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
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
        ? <Notice data-testid="complained">{say("web.card.complained")}</Notice>
        : !complaining
        ? <Button type="button" icon="report" aria-label={say("web.card.complain")} disabled={busy} onClick={() => setComplaining(true)} data-testid="complain" />
        : (
          <FieldGroup legend={say("web.card.complain")}>
            <Field kind="email" label={say("web.card.complain_email")} value={email} onChange={setEmail} data-testid="complain-email" />
            <Textarea label={say("web.card.complain_text")} value={text} maxLength={1000} onChange={setText} data-testid="complain-text" />
            <Actions>
              <Button kind="secondary" type="button" icon="close" aria-label={say("web.card.cancel")} onClick={() => setComplaining(false)} />
              <Button kind="primary" type="button" icon="send" aria-label={say("web.card.complain_send")} disabled={busy || !email.includes("@")} onClick={() => void complain()} data-testid="complain-send" />
            </Actions>
          </FieldGroup>
        ))}
      {linkCode && (report === "sent"
        ? <p className="ui-hint" role="status" data-testid="reported">{say("web.offer.reported")}</p>
        : (
          <Button type="button" icon="link" aria-label={say("web.offer.wrong")} disabled={busy || report === "sending"} onClick={() => void reportLink()} data-testid="report" />
        ))}
      {report === "failed" && <ErrorLine data-testid="report-failed">{say("web.offer.later")}</ErrorLine>}
      <Button type="button" icon="block" aria-label={say("block.item")} disabled={busy} onClick={() => setConfirmBlock(true)} data-testid="block" />
      <Confirm
        open={confirmBlock}
        title={say("block.confirm")}
        consequences={[say("web.card.block_warning")]}
        confirmLabel={say("web.card.block_yes")}
        cancelLabel={say("web.card.block_no")}
        onConfirm={() => void block()}
        onClose={() => setConfirmBlock(false)}
        confirmTestId="block-confirm-yes"
        cancelTestId="block-confirm-no"
        data-testid="block-confirm"
      />
    </>
  );
}
