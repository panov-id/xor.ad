// w4_cabinet-offers and w4_cabinet-new-offer: the advertiser's offers — a live one as a coral card, an expired one
// as a line with its visits and complaints — and the form for a new one (text, discount, the day it ends, Preview).
// The web's cabinet (web/src/adv/Cabinet.tsx Offers, NewOffer) through the same calls (depth/core/cabinet.ts holds
// them and the readings: the offer's face, the end of a discount, the letters left). What the sheet does not draw
// is here in the sheet's own pieces: the terms, the promo code and the link behind "More", the last look
// ("what a neighbour will see") and "Published". Not drawn yet, so not here: the reply to a complaint.
import { type ReactNode, useEffect, useState } from "react";
import {
  clock, dayAhead, DISCOUNT_MAX_DAYS, discountEnd, discountLabel, endProblem, inOrder, OFFER_TEXT_MAX, type Offer, offerFace, type OfferFace, offers, publish,
  type Refusal, refusalMessage, textLeft, type Venue, venues,
} from "@sdk/cabinet.ts";
import { label, say, sayCount, LANG } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { tag } from "../../shell/icons";
import { Field } from "../register-parts";
import { eye } from "../me/icons";
import { ErrorLine } from "../me/parts";
import { DayField, Frame } from "./parts";
import { plus } from "./icons";
import { momentIn } from "@sdk/cabinet.ts";

const notTaken = (status: number) => say("web.cabinet.notTaken", { status });

function LiveOffer({ face, testid }: { face: OfferFace; testid?: string }) {
  return (
    <article className="cb-offer" data-testid={testid} data-status="active">
      <div className="cb-offer-top">
        <span className="cb-offer-tag"><Icon d={tag} /><span>{face.venue ? say("app.cabinet.offer_tag", { venue: face.venue }) : say("app.cabinet.offer")}</span></span>
        <span className="cb-pill">{say("app.cabinet.until", { time: face.until })}</span>
      </div>
      <p className="cb-offer-big">{face.big}</p>
      <p className="cb-offer-text">{face.text}</p>
    </article>
  );
}

function DoneOffer({ face }: { face: OfferFace }) {
  return (
    <article className="cb-done" data-testid="adv-offer" data-status="expired">
      <div className="cb-done-top">
        <h2>{`${face.big} ${face.text}`}</h2>
        <span className="cb-done-state">{label("web.cabinet.offerExpired")}</span>
      </div>
      <dl className="cb-stats">
        <div><dt>{say("app.cabinet.visits")}</dt><dd data-testid="adv-offer-visits">{face.visits}</dd></div>
        <div><dt>{say("app.cabinet.complaints")}</dt><dd data-bad={face.many ? "yes" : undefined} data-testid="adv-offer-complaints">{face.complaints}</dd></div>
      </dl>
    </article>
  );
}

export function Offers({ strip, onNew }: { strip: ReactNode; onNew: () => void }) {
  const [rows, setRows] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    void offers().then((a) => (a.status === 200 ? setRows(inOrder(a.body!.items)) : setError(notTaken(a.status)))).catch(() => setError(notTaken(0)));
    void venues().then((a) => { if (a.status === 200) setNames(new Map(a.body!.items.map((v) => [v.id, v.name]))); }).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Frame name="cabinet-offers" title={say("app.cabinet.offers_title")} strip={strip}
      foot={<button type="button" className="cta cta-primary" onClick={onNew} data-testid="offer-new"><Icon d={plus} /><span>{say("app.cabinet.new_offer")}</span></button>}>
      <ErrorLine text={error} />
      {rows?.length === 0 && <p className="cb-sub" data-testid="offers-empty">{say("app.cabinet.no_offers")}</p>}
      {rows?.map((o) => {
        const face = offerFace(o, names);
        return face.live ? <LiveOffer key={o.id} face={face} testid="adv-offer" /> : <DoneOffer key={o.id} face={face} />;
      })}
    </Frame>
  );
}

type Stage = "form" | "preview" | "published";

export function NewOffer({ strip, onList }: { strip: ReactNode; onList: () => void }) {
  const [rows, setRows] = useState<Venue[] | null>(null);
  const [venue, setVenue] = useState("");
  const [text, setText] = useState("");
  const [discount, setDiscount] = useState("");
  const [day, setDay] = useState(() => dayAhead(7));
  const [more, setMore] = useState(false);
  const [conditions, setConditions] = useState("");
  const [promo, setPromo] = useState("");
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [done, setDone] = useState<Offer | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void venues().then((a) => {
      const verified = a.status === 200 ? a.body!.items.filter((v) => v.verification_status === "verified") : [];
      setRows(verified);
      if (verified[0]) setVenue(verified[0].id);
    }).catch(() => setRows([]));
  }, []);
  const problem = endProblem(day);
  const ready = venue !== "" && text.trim() !== "" && discount.trim() !== "" && problem === null;
  const end = discountEnd(day);
  async function go() {
    if (busy || !end) return;
    setBusy(true);
    setRefused(null);
    try {
      const answer = await publish({
        venue_id: venue, offer_text: text.trim(), discount_value: discount.trim(), discount_until: end.toISOString(),
        ...(conditions.trim() ? { conditions: conditions.trim() } : {}),
        ...(promo.trim() ? { promo_code: promo.trim() } : {}),
        ...(url.trim() ? { external_url: url.trim() } : {}),
      });
      if (answer.status === 201) { setDone(answer.body as Offer); return setStage("published"); }
      const error = (answer.body as Refusal | null)?.error;
      setRefused(error?.reason === "duplicate" ? say("web.cabinet.duplicate") : refusalMessage(answer) ?? notTaken(answer.status));
    } catch {
      setRefused(notTaken(0));
    } finally {
      setBusy(false);
    }
  }

  if (stage === "published" && done) {
    return (
      <Frame name="cabinet-published" title={say("web.cabinet.published")} strip={strip}
        foot={<button type="button" className="cta cta-primary" onClick={onList} data-testid="offer-to-list"><Icon d={tag} /><span>{say("app.cabinet.my_offers")}</span></button>}>
        <p className="cb-sub" data-testid="offer-published">{say("web.cabinet.publishedNote")}</p>
        {done.external_url && <p className="cb-hint" data-testid="offer-published-link">{say("web.cabinet.link", { link: done.link.replace(/^https:\/\//, "") })}</p>}
        <p className="cb-hint">{say("web.cabinet.cardLives", { until: momentIn(LANG, done.discount_until) })}</p>
        <p className="cb-hint">{say("web.cabinet.noEdit")}</p>
      </Frame>
    );
  }

  if (stage === "preview" && end) {
    const at = rows?.find((v) => v.id === venue);
    const face: OfferFace = { live: true, big: discountLabel(discount), text: text.trim(), venue: at?.name ?? "", until: clock(end.toISOString()), visits: 0, complaints: 0, many: false };
    return (
      <Frame name="cabinet-preview" title={say("web.cabinet.previewTitle")} strip={strip}
        foot={
          <button type="button" className="cta cta-primary" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => void go()} data-testid="offer-publish">
            <Icon d={plus} /><span>{label("web.cabinet.publish")}</span>
          </button>
        }>
        <LiveOffer face={face} testid="offer-preview-card" />
        {conditions.trim() && <p className="cb-hint">{label("web.cabinet.field.terms")}: {conditions.trim()}</p>}
        <p className="cb-hint">{say("web.cabinet.publishNote")}</p>
        {refused && <ErrorLine text={say("web.cabinet.refused", { reason: refused })} />}
        <button type="button" className="cb-btn cb-btn-quiet" onClick={() => setStage("form")} data-testid="offer-to-form"><span>{label("web.cabinet.toForm")}</span></button>
      </Frame>
    );
  }

  return (
    <Frame name="cabinet-new-offer" title={say("app.cabinet.new_offer")} strip={strip}
      foot={
        <button type="button" className="cta cta-primary" aria-disabled={ready ? undefined : true} onClick={() => ready && (setRefused(null), setStage("preview"))} data-testid="offer-preview">
          <Icon d={eye} /><span>{say("app.cabinet.preview")}</span>
        </button>
      }>
      {rows !== null && rows.length === 0 && <p className="cb-sub" data-testid="offer-no-venue">{say("web.cabinet.noVenue")}</p>}
      {rows !== null && rows.length > 1 && (
        <div className="me-chips" role="radiogroup" aria-label={label("web.cabinet.field.venue")} data-testid="offer-venue">
          {rows.map((v) => <button key={v.id} type="button" role="radio" aria-checked={v.id === venue} className="me-chip" onClick={() => setVenue(v.id)}>{v.name}</button>)}
        </div>
      )}
      {rows !== null && rows.length > 0 && (
        <>
          <Field text={label("web.cabinet.field.text")} value={text} onChange={setText} maxLength={OFFER_TEXT_MAX} testid="offer-text" autoComplete="off"
            under={<p className="reg-counter" data-testid="offer-left">{sayCount("app.cabinet.left", textLeft(text))}</p>} />
          <Field text={label("web.cabinet.field.discount")} value={discount} onChange={setDiscount} maxLength={32} testid="offer-discount" autoComplete="off" />
          <DayField text={label("web.cabinet.field.discountTo")} value={day} min={dayAhead(0)} max={dayAhead(DISCOUNT_MAX_DAYS)} onChange={setDay} testid="offer-until" />
          <p className="cb-hint" data-state={problem ?? undefined} data-testid="offer-lives">
            {problem === "past" ? say("app.cabinet.day_past") : problem === "far" ? label("web.cabinet.within90") : say("app.cabinet.lives")}
          </p>
          <button type="button" className="cb-more" aria-expanded={more} onClick={() => setMore(!more)} data-testid="offer-more">{say("app.cabinet.more")}</button>
          {more && (
            <>
              <Field text={label("web.cabinet.field.terms")} value={conditions} onChange={setConditions} maxLength={128} testid="offer-conditions" autoComplete="off" under={<p className="reg-hint">{say("web.cabinet.termsEmpty")}</p>} />
              <Field text={label("web.cabinet.field.promo")} value={promo} onChange={setPromo} maxLength={64} testid="offer-promo" autoComplete="off" />
              <Field text={label("web.cabinet.field.url")} value={url} onChange={setUrl} testid="offer-url" autoComplete="off" under={<p className="reg-hint">{say("web.cabinet.noShorteners")}</p>} />
            </>
          )}
        </>
      )}
    </Frame>
  );
}
