// A card's state and actions (step 4 of the brand split): like, hide, block
// asked twice, the venue offer's complaint and the report on its link — what
// every brand's CardView draws. Moved from screens/Card.tsx; `like`, `hide`
// and `block` are the handlers the buttons called inline.

import { useState } from "react";
import type { Client } from "../../../../depth/core/client.ts";
import { blockByPhrase, hidePhrase, likePhrase, type LikeOutcome } from "../../api/actions.ts";
import { say } from "../../locales/say.ts";
import type { FeedCard } from "../Feed.tsx";

export function useCard(
  { client, card, onGone }: {
    client: Client;
    card: FeedCard;
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

  const liked = like !== null && like.state !== "refused";
  const doLike = () => act(async () => setLike(await likePhrase(client, card.id)));
  const hide = () => act(async () => { await hidePhrase(client, card.id); onGone("hidden", card.id); });
  const block = () => act(async () => { await blockByPhrase(client, card.id); onGone("blocked", card.id); });
  return {
    like, liked, busy, error, doLike, hide, block, confirmBlock, setConfirmBlock,
    complaining, setComplaining, email, setEmail, text, setText, complained, complain,
    linkCode, report, reportLink,
  };
}

export type CardLogic = ReturnType<typeof useCard>;
