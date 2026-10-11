// A phrase full-screen (the card of screen 03's sheet, depth's full-screen
// card): the text large, the mode and the language under it, and the main row
// of exactly two actions welded in one capsule — like (§8.4) | hide it from
// one's own feed (§8.9). The rarer, dangerous ones — block its author (§8.9),
// the venue offer's complaint, the report on its link — stand behind «…» in
// the header, in a bottom sheet (strict review 11.10, card-more.svg). A like
// that meets a like becomes a match: the row turns into one «talk» that leads
// to the inbox, where the offer to talk waits. Hiding and blocking take the
// card away and lead back to the feed. Blocking asks twice and names the
// consequence, as the terminal does. Kit elements only (K6a).

import type { ReactNode } from "react";
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
import { ActionSheet, Confirm, type SheetAction } from "../ui/Sheet.tsx";
import { Split } from "../ui/Split.tsx";
import { Textarea } from "../ui/Textarea.tsx";
import type { FeedCard } from "./Feed.tsx";
import { say } from "../locales/say.ts";

export function Card(
  { client, card, onBack, onGone, onTalk }: {
    client: Client;
    card: FeedCard;
    onBack: () => void;
    // «talk» after a match: to the inbox, where the match's offer to talk waits.
    onTalk?: () => void;
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
      header={<HeaderScreen title={say("web.card.phrase")} onBack={onBack} backLabel={say("web.card.back")} action={<CardMore card={card} logic={logic} />} />}
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
      <CardTalk logic={logic} onTalk={onTalk}>
        <Split>
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
          <Button
            type="button"
            icon="hide"
            aria-label={say("feed.hide")}
            disabled={busy}
            onClick={() => void hide()}
            data-testid="hide"
          />
        </Split>
      </CardTalk>
      <CardExtras card={card} logic={logic} />
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

// After a match the main row is one primary «talk»: the match is in the inbox, where the offer to talk
// waits (App.tsx opens the inbox; Inbox opens the match, Match agrees — the existing path, no new call).
// Without a match, or without an `onTalk`, the row stays as the caller drew it (`children`).
export function CardTalk({ logic, onTalk, children }: { logic: CardLogic; onTalk?: () => void; children?: ReactNode }) {
  if (logic.like?.state !== "matched" || !onTalk) return <>{children}</>;
  return (
    <Split label={say("web.card.matched")}>
      <Button type="button" kind="primary" icon="say" aria-label={say("web.card.talk")} onClick={onTalk} data-testid="talk" />
    </Split>
  );
}

// The «…» in the header and its bottom sheet (card-more.svg): the rare actions, the quiet first, the dangerous
// ones (block, complaint) last and red. What was done stays out of the list: a sent complaint or report is
// said on the card (CardExtras), not offered twice.
export function CardMore({ card, logic }: { card: FeedCard; logic: CardLogic }) {
  const { busy, moreOpen, setMoreOpen, setConfirmBlock, setComplaining, complained, linkCode, report, reportLink } = logic;
  const actions: SheetAction[] = [];
  if (linkCode && report !== "sent") {
    actions.push({ id: "report", label: say("web.offer.wrong"), onSelect: () => void reportLink(), disabled: busy || report === "sending", testid: "report" });
  }
  if (card.kind === "offer" && !complained) {
    actions.push({ id: "complain", label: say("web.card.complain"), onSelect: () => setComplaining(true), danger: true, disabled: busy, testid: "complain" });
  }
  actions.push({ id: "block", label: say("block.item"), onSelect: () => setConfirmBlock(true), danger: true, disabled: busy, testid: "block" });
  return (
    <>
      <Button type="button" icon="more" aria-label={say("web.card.more")} aria-haspopup="dialog" onClick={() => setMoreOpen(true)} data-testid="more" />
      <ActionSheet open={moreOpen} title={say("web.card.more")} actions={actions} onClose={() => setMoreOpen(false)} data-testid="more-sheet" />
    </>
  );
}

// What the sheet's choices leave on the card: the complaint's form and its answer, the link report's
// answer, the block asked twice. Shared by every brand's CardView.
export function CardExtras({ card, logic }: { card: FeedCard; logic: CardLogic }) {
  const {
    busy, block, confirmBlock, setConfirmBlock, complaining, setComplaining, email, setEmail, text, setText,
    complained, complain, linkCode, report,
  } = logic;
  return (
    <>
      {card.kind === "offer" && (complained
        ? <Notice data-testid="complained">{say("web.card.complained")}</Notice>
        : complaining && (
          <FieldGroup legend={say("web.card.complain")}>
            <Field kind="email" label={say("web.card.complain_email")} value={email} onChange={setEmail} data-testid="complain-email" />
            <Textarea label={say("web.card.complain_text")} value={text} maxLength={1000} onChange={setText} data-testid="complain-text" />
            <Actions>
              <Button kind="secondary" type="button" icon="close" aria-label={say("web.card.cancel")} onClick={() => setComplaining(false)} />
              <Button kind="primary" type="button" icon="send" aria-label={say("web.card.complain_send")} disabled={busy || !email.includes("@")} onClick={() => void complain()} data-testid="complain-send" />
            </Actions>
          </FieldGroup>
        ))}
      {linkCode && report === "sent" && <p className="ui-hint" role="status" data-testid="reported">{say("web.offer.reported")}</p>}
      {report === "failed" && <ErrorLine data-testid="report-failed">{say("web.offer.later")}</ErrorLine>}
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
