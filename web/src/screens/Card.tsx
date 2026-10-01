// A phrase full-screen (the card of screen 03's sheet, depth's full-screen
// card): the text large, the mode and the language under it, and
// the three things one can do with somebody else's phrase — like (§8.4), hide
// it from one's own feed (§8.9), block its author (§8.9). A like that meets a
// like becomes a match and says so; hiding and blocking take the card away
// and lead back to the feed. Blocking asks twice and names the consequence,
// as the terminal does.

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { blockByPhrase, hidePhrase, likePhrase, modes, type LikeOutcome } from "../api/actions.ts";
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
  const [like, setLike] = useState<LikeOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A venue's offer (W12; offers spec §3, §10.2): "the discount was not
  // given", with an address — the only way to send the decision back.
  const [complaining, setComplaining] = useState(false);
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [complained, setComplained] = useState(false);

  // "The link leads somewhere else" (offers spec §10.1): only from here, where
  // the identity is open — the exit screen opens before unlocking, so it
  // never had one to sign with (owner's decision 28.09, WS3). The node answers
  // 202 whether the report counted, so the card says only "принято".
  const linkCode = card.kind === "offer" && card.offer?.redirect_disabled === false
    ? card.offer.redirect?.split("/o/").pop() ?? null
    : null;
  const [report, setReport] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function reportLink() {
    if (!linkCode) return;
    setReport("sending");
    try {
      const answer = await client.request("POST", `/o/${encodeURIComponent(linkCode)}/report`);
      setReport(answer.status === 202 ? "sent" : "failed");
    } catch {
      setReport("failed");
    }
  }

  async function complain() {
    await act(async () => {
      const answer = await client.request<{ error?: { message?: string } }>(
        "POST", `/offers/${encodeURIComponent(card.id)}/complaints`, { notifier_email: email.trim(), text: text.trim() },
      );
      if (answer.status !== 202) throw new Error(answer.body?.error?.message ?? say("web.card.complaint_refused", { status: answer.status }));
      setComplained(true);
      setComplaining(false);
    });
  }

  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
      {like?.state === "liked" && <p className="warn" data-testid="liked">{say("web.card.liked")}</p>}
      {like?.state === "matched" && <p className="warn" data-testid="matched">{say("web.card.matched")}</p>}
      {like?.state === "refused" && <p className="error" data-testid="refused">{like.why}</p>}
      {error && <p className="error" data-testid="error">{error}</p>}
      <div className="actions">
        <Button
          type="button"
          kind="primary"
          disabled={busy || (like !== null && like.state !== "refused")}
          onClick={() => act(async () => setLike(await likePhrase(client, card.id)))}
          data-testid="like"
        >
          {say("web.card.like")}
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => act(async () => { await hidePhrase(client, card.id); onGone("hidden", card.id); })}
          data-testid="hide"
        >
          {say("feed.hide")}
        </Button>
        {card.kind === "offer" && (complained
          ? <p data-testid="complained">{say("web.card.complained")}</p>
          : !complaining
          ? <Button kind="text" type="button" disabled={busy} onClick={() => setComplaining(true)} data-testid="complain">{say("web.card.complain")}</Button>
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
              <Button kind="danger" type="button" disabled={busy || !email.includes("@")} onClick={() => void complain()} data-testid="complain-send">{say("web.card.complain_send")}</Button>
              <Button kind="secondary" type="button" onClick={() => setComplaining(false)}>{say("web.card.cancel")}</Button>
            </section>
          ))}
        {linkCode && (report === "sent"
          ? <p className="offer-toast" role="status" data-testid="reported">{say("web.offer.reported")}</p>
          : (
            <Button kind="text" type="button" disabled={busy || report === "sending"} onClick={() => void reportLink()} data-testid="report">
              {say("web.offer.wrong")}
            </Button>
          ))}
        {report === "failed" && <p className="error" data-testid="report-failed">{say("web.offer.later")}</p>}
        {!confirmBlock
          ? (
            <Button type="button" disabled={busy} onClick={() => setConfirmBlock(true)} data-testid="block">
              {say("block.item")}
            </Button>
          )
          : (
            <section className="confirm" data-testid="block-confirm">
              <p className="muted">{say("web.card.block_warning")}</p>
              <Button
                type="button"
                kind="danger"
                disabled={busy}
                onClick={() => act(async () => { await blockByPhrase(client, card.id); onGone("blocked", card.id); })}
                data-testid="block-confirm-yes"
              >
                {say("web.card.block_yes")}
              </Button>
              <Button type="button" onClick={() => setConfirmBlock(false)} data-testid="block-confirm-no">{say("web.card.block_no")}</Button>
            </section>
          )}
      </div>
    </main>
  );
}
