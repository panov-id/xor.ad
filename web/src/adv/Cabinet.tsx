// The venue's cabinet (A1; screen 17, panel/design/sheets/screen-17-venue.svg;
// offers/SPEC_RU.md §2.1, §6, §8, §11): a separate web sign-in by mail, not
// the app — no identity, no bottom navigation. The way in is only the link
// from the letter, opened in the browser that asked; then the venues, each
// proved by the code from an envelope mailed to its address, and the offers,
// which a verified venue publishes at once and whole. Words from the sheet;
// where the sheet draws a control without words, the control's own name.

import { useEffect, useState } from "react";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { Chip } from "../ui/Chip.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { Field, FieldGroup } from "../ui/Field.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { List } from "../ui/List.tsx";
import { Nav } from "../ui/Nav.tsx";
import { Notice } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Select } from "../ui/Select.tsx";
import { Stat } from "../ui/Stat.tsx";
import {
  addVenue, answerComplaint, type Complaint, complaints, me, movePlace, notUs, type Offer, offers, openSession, orderEnvelope, type Place, publish, RADII, type Refusal, signIn,
  signUp, type Venue, venues, verify, when,
} from "./api.ts";
import { BRAND, NAMES } from "../config.ts";
import { say } from "../locales/say.ts";
import { Info } from "../ui/Info.tsx";

type View = "loading" | "sign-in" | "sent" | "expired" | "venues" | "offers" | "new-offer";
const PATHS: Record<View, string> = { loading: "", "sign-in": "", sent: "", expired: "", venues: "/venues", offers: "/offers", "new-offer": "/offers/new" };

const STATUS: Record<string, string> = {
  unverified: say("web.cabinet.statusUnverified"),
  verified: say("web.cabinet.statusVerified"),
  suspended: say("web.cabinet.statusSuspended"),
};

// The token rides in the link's fragment (`/enter#<token>`): it never reaches
// a server log, and it is spent on the first try.
function tokenFromLink(): string | null {
  if (!/\/enter\/?$/.test(location.pathname)) return null;
  const token = location.hash.replace(/^#/, "");
  return /^[0-9a-f]{64}$/.test(token) ? token : "";
}

export function Cabinet() {
  const [view, setView] = useState<View>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const token = tokenFromLink();
      const base = location.pathname.replace(/\/enter\/?$/, "") || "/";
      if (token !== null) {
        history.replaceState(null, "", base);
        const opened = token ? await openSession(token) : { status: 401 };
        return setView(opened.status === 204 ? "venues" : "expired");
      }
      const who = await me().catch(() => ({ status: 0 }));
      setView(who.status === 200 ? "venues" : "sign-in");
    })();
  }, []);

  const title = say("web.cabinet.title");
  const inside = view === "venues" || view === "offers" || view === "new-offer";
  const items = inside ? [
    { label: say("web.cabinet.tabVenues"), current: view === "venues", onSelect: () => setView("venues"), testid: "adv-tab-venues" },
    { label: say("web.cabinet.myOffers"), current: view !== "venues", onSelect: () => setView("offers"), testid: "adv-tab-offers" },
  ] : undefined;
  return (
    // Sheet 17's strip: where you are, in mono, and the other section as a
    // word — a separate web sign-in, no app navigation. The address is the
    // cabinet's public one (adv.<storefront>), never the host the page was
    // opened on: on a stand that is an internal name (web-adv:4173).
    <Screen name={`adv-${view}`} title={title} header={<Nav where={`adv.${NAMES[BRAND]}${PATHS[view]}`} label={title} items={items} />}>
      {view === "loading" && <p className="ui-hint" data-testid="loading">…</p>}
      {view === "sign-in" && <SignIn onSent={() => setView("sent")} onError={setError} />}
      {view === "sent" && (
        <>
          <HeaderScreen title={title} />
          <p data-testid="adv-sent">{say("web.cabinet.sent")}</p>
          <div className="ui-info-row"><Info label={title} data-testid="adv-sent-info"><p>{say("web.cabinet.linkOnce")}</p></Info></div>
        </>
      )}
      {view === "expired" && (
        <>
          <HeaderScreen title={say("web.cabinet.expired")} />
          <div className="ui-info-row">
            <Info label={title} data-testid="adv-expired-info"><p>{say("web.cabinet.linkOnceSpent")}</p><p>{say("web.cabinet.limit")}</p></Info>
          </div>
          <Button kind="primary" type="button" icon="link" className="ui-wide" aria-label={say("web.cabinet.askAgain")} onClick={() => setView("sign-in")} data-testid="adv-again" />
        </>
      )}
      {view === "venues" && <Venues onError={setError} />}
      {view === "offers" && <Offers onNew={() => setView("new-offer")} onError={setError} />}
      {view === "new-offer" && <NewOffer onDone={() => setView("offers")} onError={setError} />}
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
    </Screen>
  );
}

function SignIn({ onSent, onError }: { onSent: () => void; onError: (e: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    onError(null);
    try {
      // A contact makes it a new account; the answer is the same either way.
      const answer = contact.trim() ? await signUp(email.trim(), contact.trim()) : await signIn(email.trim());
      if (answer.status === 204) return onSent();
      if (answer.status === 429) return onError(say("web.cabinet.tooMany", { n: answer.retryAfter ?? "?" }));
      onError(say("web.cabinet.notTaken", { status: answer.status }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <HeaderScreen title={say("web.cabinet.title")} />
      <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="adv-sign-in-info"><p>{say("web.cabinet.linkOnly")}</p></Info></div>
      <Field kind="email" label={say("web.cabinet.email")} value={email} onChange={setEmail} data-testid="adv-email" />
      <Field label={say("web.cabinet.contact")} value={contact} onChange={setContact} autoComplete="off" data-testid="adv-contact" />
      <Button kind="primary" type="button" icon="link" className="ui-wide" aria-label={say("web.cabinet.getLink")} disabled={!email.includes("@") || busy} onClick={() => void go()} data-testid="adv-send" />
    </>
  );
}

// The place as three fields: latitude, longitude and the circle, 1000 m unless
// changed. Both numbers or neither.
function PlaceFields({ value, onChange, prefix }: { value: PlaceInput; onChange: (v: PlaceInput) => void; prefix: string }) {
  return (
    <FieldGroup legend={say("web.cabinet.point")}>
      <Field kind="decimal" label={say("loc.lat")} value={value.lat} onChange={(lat) => onChange({ ...value, lat })} data-testid={`${prefix}-lat`} />
      <Field kind="decimal" label={say("loc.lon")} value={value.lon} onChange={(lon) => onChange({ ...value, lon })} data-testid={`${prefix}-lon`} />
      <Select label={say("web.cabinet.radius")} value={String(value.radius)} onChange={(r) => onChange({ ...value, radius: Number(r) })} options={RADII.map((r) => ({ value: String(r), label: String(r) }))} data-testid={`${prefix}-radius`} />
    </FieldGroup>
  );
}

type PlaceInput = { lat: string; lon: string; radius: number };
const EMPTY_PLACE: PlaceInput = { lat: "", lon: "", radius: 1000 };
const placeOf = (p: PlaceInput): Place | null | "bad" => {
  if (!p.lat.trim() && !p.lon.trim()) return null;
  const lat = Number(p.lat.replace(",", ".")), lon = Number(p.lon.replace(",", "."));
  return Number.isFinite(lat) && Number.isFinite(lon) && p.lat.trim() && p.lon.trim() ? { lat, lon, area_radius: p.radius } : "bad";
};

function Venues({ onError }: { onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<Venue[] | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [place, setPlace] = useState<PlaceInput>(EMPTY_PLACE);
  const load = () => venues().then((a) => a.status === 200 ? setRows(a.body!.items) : onError(say("web.cabinet.notTaken", { status: a.status })));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function add() {
    onError(null);
    const at = placeOf(place);
    if (at === "bad") return onError(say("web.cabinet.pointNumbers"));
    const made = await addVenue(name.trim(), address.trim(), at ?? undefined);
    if (made.status !== 201) return onError(made.body?.error?.message ?? say("web.cabinet.notTaken", { status: made.status }));
    setName("");
    setAddress("");
    setPlace(EMPTY_PLACE);
    await load();
  }
  return (
    <>
      <HeaderScreen title={say("web.cabinet.verification")} />
      {rows === null ? <p className="ui-hint">…</p> : rows.map((v) => <VenueRow key={v.id} venue={v} onChanged={load} onError={onError} />)}
      <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="adv-venues-info"><p>{say("web.cabinet.unverifiedNote")}</p></Info></div>
      <FieldGroup legend={say("web.cabinet.addVenue")}>
        <Field label={say("web.cabinet.name")} value={name} onChange={setName} autoComplete="off" data-testid="venue-name" />
        <Field label={say("web.cabinet.address")} value={address} onChange={setAddress} autoComplete="street-address" data-testid="venue-address" />
        <PlaceFields value={place} onChange={setPlace} prefix="venue" />
        <Button kind="primary" type="button" icon="new" className="ui-wide" aria-label={say("web.cabinet.addVenue")} disabled={!name.trim() || !address.trim()} onClick={() => void add()} data-testid="venue-add" />
      </FieldGroup>
      <NotUs />
    </>
  );
}

// Sheet 17, «это не мы»: a code from an envelope nobody here ordered suspends
// that venue at once (SPEC §11). The node answers 204 to a right and a wrong
// code alike, so the screen does not say which it was — the field clears.
function NotUs() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await notUs(code.trim());
      setCode("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card as="section" data-testid="adv-not-us">
      <h2>{say("web.cabinet.notUsTitle")}</h2>
      <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="adv-not-us-info"><p>{say("web.cabinet.notUsNote")}</p></Info></div>
      <Field label={say("web.cabinet.envelopeCode")} value={code} onChange={setCode} autoComplete="off" data-testid="adv-not-us-code" />
      <Button kind="danger" type="button" icon="report" className="ui-wide" aria-label={say("web.cabinet.notUs")} disabled={busy || code.replace(/[\s-]/g, "").length !== 12} onClick={() => void send()} data-testid="adv-not-us-send" />
    </Card>
  );
}

function VenueRow({ venue, onChanged, onError }: { venue: Venue; onChanged: () => void; onError: (e: string | null) => void }) {
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [place, setPlace] = useState<PlaceInput>(venue.place
    ? { lat: String(venue.place.lat), lon: String(venue.place.lon), radius: venue.place.area_radius }
    : EMPTY_PLACE);
  async function move() {
    onError(null);
    const at = placeOf(place);
    if (at === null || at === "bad") return onError(say("web.cabinet.pointNumbers"));
    const answer = await movePlace(venue.id, at);
    if (answer.status !== 200) return onError(answer.body?.error?.message ?? say("web.cabinet.notTaken", { status: answer.status }));
    setMoving(false);
    onChanged();
  }
  async function order() {
    onError(null);
    const answer = await orderEnvelope(venue.id);
    if (answer.status !== 202) return onError(answer.body?.error?.message ?? say("web.cabinet.notTaken", { status: answer.status }));
    onChanged();
  }
  async function check() {
    onError(null);
    setWrong(null);
    const answer = await verify(venue.id, code);
    if (answer.status === 200) return onChanged();
    const refusal = answer.body as Refusal | null;
    if (answer.status === 422) {
      setWrong(say("web.cabinet.codeWrong", { n: refusal?.error?.attempts_left ?? "?" }));
      return onChanged();
    }
    if (answer.status === 409) {
      setWrong(say("web.cabinet.codeSpent"));
      return onChanged();
    }
    onError(refusal?.error?.message ?? say("web.cabinet.notTaken", { status: answer.status }));
  }
  return (
    <Card of="venue" data-testid="venue" data-status={venue.verification_status}>
      <h2>{venue.name}</h2>
      <p className="ui-hint">{venue.address}</p>
      <p data-testid="venue-status">{STATUS[venue.verification_status] ?? venue.verification_status}</p>
      <p className="ui-hint" data-testid="venue-place">
        {venue.place ? say("web.cabinet.placeAt", { lat: venue.place.lat, lon: venue.place.lon, radius: venue.place.area_radius }) : say("web.cabinet.placeNone")}
      </p>
      {moving
        ? (
          <>
            {venue.verification_status === "verified" && <div className="ui-info-row"><Info label={say("web.cabinet.movePoint")} warn data-testid="venue-move-info"><p>{say("web.cabinet.moveWarn")}</p></Info></div>}
            <PlaceFields value={place} onChange={setPlace} prefix="venue-move" />
            <Button kind="primary" type="button" icon="check" aria-label={say("web.cabinet.savePoint")} onClick={() => void move()} data-testid="venue-move-save" />
          </>
        )
        : <Button kind="secondary" type="button" icon="pin" className="ui-wide-half" aria-label={venue.place ? say("web.cabinet.movePoint") : say("web.cabinet.setPoint")} onClick={() => setMoving(true)} data-testid="venue-move" />}
      {venue.verification_status === "unverified" && (venue.envelope_expires_at
        ? (
          <>
            <p className="ui-hint">{say("web.cabinet.envelopeSent", { address: venue.address })}</p>
            <Field label={say("web.cabinet.envelopeCode")} value={code} onChange={(v) => setCode(v.toUpperCase())} autoComplete="off" data-testid="venue-code" />
            <Button kind="primary" type="button" icon="check" aria-label={say("web.cabinet.confirm")} disabled={code.replace(/[\s-]/g, "").length !== 12} onClick={() => void check()} data-testid="venue-verify" />
          </>
        )
        : <Button kind="secondary" type="button" icon="mail" className="ui-wide-half" aria-label={say("web.cabinet.orderEnvelope")} onClick={() => void order()} data-testid="venue-envelope" />)}
      {wrong && <ErrorLine data-testid="venue-wrong">{wrong}</ErrorLine>}
    </Card>
  );
}

// From this many complaints on an offer the count is told as «много», not only red.
const MANY_COMPLAINTS = 3;

function Offers({ onNew, onError }: { onNew: () => void; onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<Offer[] | null>(null);
  useEffect(() => {
    void offers().then((a) => a.status === 200 ? setRows(a.body!.items) : onError(say("web.cabinet.notTaken", { status: a.status })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <HeaderScreen
        title={say("web.cabinet.myOffersTitle")}
        action={<Button kind="primary" type="button" icon="new" aria-label={say("web.cabinet.newOffer")} onClick={onNew} data-testid="offer-new" />}
      />
      {rows?.map((o) => (
        <Card key={o.id} of="offer" data-testid="adv-offer" data-status={o.status}>
          <p data-testid="adv-offer-state">{o.status === "active" ? say("web.cabinet.offerLive") : say("web.cabinet.offerExpired")}</p>
          <div><Chip label={o.discount_value} tone="accent" /></div>
          <p>{o.offer_text}</p>
          <p className="ui-hint">{say("web.cabinet.discountUntil", { until: when(o.discount_until) })}</p>
          <p className="ui-hint">{say("web.cabinet.hits", { n: o.redirect_hits })}</p>
          {(o.complaints ?? 0) > 0 && <Stat label={say("web.cabinet.complaints")} value={o.complaints ?? 0} bad={(o.complaints ?? 0) >= MANY_COMPLAINTS} data-testid="adv-offer-complaints" />}
          {o.external_url && <p className="ui-hint" data-testid="adv-offer-link">{say("web.cabinet.link", { link: o.link.replace(/^https:\/\//, "") })}{o.link_disabled ? say("web.cabinet.linkOff") : ""}</p>}
        </Card>
      ))}
      <Complaints onError={onError} />
    </>
  );
}

// Sheet 17, «Жалобы «скидку не дали»»: text and date, no person (SPEC §10);
// the one private answer to the moderator, never rewritten (409 on a second).
function Complaints({ onError }: { onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<Complaint[] | null>(null);
  const load = () => complaints().then((a) => a.status === 200 ? setRows(a.body!.items) : onError(say("web.cabinet.notTaken", { status: a.status })));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows || rows.length === 0) return null;
  return (
    <>
      <h2>{say("web.cabinet.complaintsTitle")}</h2>
      <List label={say("web.cabinet.complaintsTitle")} data-testid="adv-complaints">
        {rows.map((c) => <ComplaintRow key={c.id} complaint={c} onAnswered={load} onError={onError} />)}
      </List>
    </>
  );
}

function ComplaintRow({ complaint, onAnswered, onError }: { complaint: Complaint; onAnswered: () => void; onError: (e: string | null) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    onError(null);
    try {
      const answer = await answerComplaint(complaint.id, text.trim());
      if (answer.status !== 204) return onError(answer.body?.error?.message ?? say("web.cabinet.notTaken", { status: answer.status }));
      setText("");
      await onAnswered();
    } finally {
      setBusy(false);
    }
  }
  const state = complaint.status === "resolved" ? say("web.cabinet.complaintResolved")
    : complaint.status === "rejected" ? say("web.cabinet.complaintRejected")
    : complaint.response ? null : say("web.cabinet.complaintWaits");
  return (
    <Card as="li" kind="nested" data-testid="adv-complaint" data-status={complaint.status}>
      <p className="ui-hint">{when(`${complaint.date}T00:00:00Z`).split(",")[0]}</p>
      <p>{complaint.text}</p>
      {state && (complaint.status === "pending" ? <Notice>{state}</Notice> : <p className="ui-hint">{state}</p>)}
      {complaint.response
        ? <p className="ui-hint" data-testid="adv-complaint-response">{complaint.response}</p>
        : (
          <>
            <Field label={say("web.cabinet.answerLabel")} value={text} maxLength={1000} onChange={setText} autoComplete="off" data-testid="adv-complaint-text" />
            <Button kind="primary" type="button" icon="send" aria-label={say("web.cabinet.answer")} disabled={busy || !text.trim()} onClick={() => void send()} data-testid="adv-complaint-send" />
          </>
        )}
    </Card>
  );
}

// A local "datetime-local" value for a moment `days` ahead.
const ahead = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function NewOffer({ onDone, onError }: { onDone: () => void; onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<Venue[] | null>(null);
  const [venue, setVenue] = useState("");
  const [text, setText] = useState("");
  const [discount, setDiscount] = useState("");
  const [conditions, setConditions] = useState("");
  const [until, setUntil] = useState(ahead(7));
  const [promo, setPromo] = useState("");
  const [url, setUrl] = useState("");
  const [done, setDone] = useState<Offer | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    void venues().then((a) => {
      const verified = a.status === 200 ? a.body!.items.filter((v) => v.verification_status === "verified") : [];
      setRows(verified);
      if (verified[0]) setVenue(verified[0].id);
    });
  }, []);
  async function go() {
    setBusy(true);
    setRefused(null);
    onError(null);
    try {
      const answer = await publish({
        venue_id: venue, offer_text: text.trim(), discount_value: discount.trim(), discount_until: new Date(until).toISOString(),
        ...(conditions.trim() ? { conditions: conditions.trim() } : {}),
        ...(promo.trim() ? { promo_code: promo.trim() } : {}),
        ...(url.trim() ? { external_url: url.trim() } : {}),
      });
      if (answer.status === 201) return setDone(answer.body as Offer);
      const error = (answer.body as Refusal | null)?.error;
      if (error?.reason === "duplicate") return setRefused(say("web.cabinet.duplicate"));
      setRefused(error?.message ?? say("web.cabinet.notTaken", { status: answer.status }));
    } finally {
      setBusy(false);
    }
  }
  if (previewing && !done) {
    // Sheet 17, «Так увидит сосед»: the card as the feed draws it, from the
    // form alone; publishing is at once and whole, so this is the last look.
    const at = rows?.find((v) => v.id === venue);
    return (
      <>
        <HeaderScreen title={say("web.cabinet.previewTitle")} />
        <Card of="preview" data-testid="offer-preview-card">
          <Chip label={say("web.cabinet.offerChip")} tone="accent" outline />
          <Chip label={discount.trim()} tone="accent" />
          {at && <h2>{at.name}</h2>}
          <p>{text.trim()}</p>
          {conditions.trim() && <p className="ui-hint">{say("web.cabinet.field.terms")}: {conditions.trim()}</p>}
          <p className="ui-hint">{say("web.cabinet.discountUntil", { until: when(new Date(until).toISOString()) })}</p>
        </Card>
        <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="offer-publish-info"><p>{say("web.cabinet.publishNote")}</p></Info></div>
        {refused && <ErrorLine data-testid="offer-refused">{say("web.cabinet.refused", { reason: refused })}</ErrorLine>}
        <Button kind="primary" type="button" icon="send" className="ui-wide" aria-label={say("web.cabinet.publish")} disabled={busy} onClick={() => void go()} data-testid="offer-publish" />
        <Button kind="secondary" type="button" icon="back" className="ui-wide" aria-label={say("web.cabinet.toForm")} onClick={() => setPreviewing(false)} data-testid="offer-to-form" />
      </>
    );
  }
  if (done) {
    return (
      <>
        <HeaderScreen title={say("web.cabinet.published")} />
        <Card as="section" data-testid="offer-published">
          <p>{say("web.cabinet.publishedNote")}</p>
          {done.external_url && <p data-testid="offer-published-link">{say("web.cabinet.link", { link: done.link.replace(/^https:\/\//, "") })}</p>}
          <p className="ui-hint">{say("web.cabinet.cardLives", { until: when(done.discount_until) })}</p>
        </Card>
        <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="offer-published-info"><p>{say("web.cabinet.noEdit")}</p></Info></div>
        <Button kind="secondary" type="button" icon="offers" className="ui-wide" aria-label={say("web.cabinet.myOffers")} onClick={onDone} data-testid="offer-to-list" />
      </>
    );
  }
  return (
    <>
      <HeaderScreen title={say("web.cabinet.newOfferTitle")} />
      {rows !== null && rows.length === 0 && <p className="ui-hint" data-testid="offer-no-venue">{say("web.cabinet.noVenue")}</p>}
      {rows !== null && rows.length > 0 && (
        <>
          <Select label={say("web.cabinet.field.venue")} value={venue} onChange={setVenue} options={rows.map((v) => ({ value: v.id, label: `${v.name} · ${v.address}` }))} data-testid="offer-venue" />
          <Field label={say("web.cabinet.field.text")} value={text} maxLength={128} onChange={setText} autoComplete="off" data-testid="offer-text" />
          <Field label={say("web.cabinet.field.discount")} value={discount} maxLength={32} onChange={setDiscount} autoComplete="off" data-testid="offer-discount" />
          <Field label={say("web.cabinet.field.terms")} hint={say("web.cabinet.termsEmpty")} value={conditions} maxLength={128} onChange={setConditions} autoComplete="off" data-testid="offer-conditions" />
          <Field kind="datetime" label={say("web.cabinet.field.discountTo")} hint={say("web.cabinet.within90")} value={until} onChange={setUntil} data-testid="offer-until" />
          <Field label={say("web.cabinet.field.promo")} value={promo} maxLength={64} onChange={setPromo} autoComplete="off" data-testid="offer-promo" />
          <Field kind="url" label={say("web.cabinet.field.url")} hint={say("web.cabinet.noShorteners")} value={url} onChange={setUrl} autoComplete="off" data-testid="offer-url" />
          <Button kind="secondary" type="button" icon="eye" className="ui-wide" aria-label={say("web.cabinet.preview")} disabled={!venue || !text.trim() || !discount.trim()} onClick={() => { setRefused(null); setPreviewing(true); }} data-testid="offer-preview" />
        </>
      )}
    </>
  );
}
