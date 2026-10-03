// The venue's cabinet (A1; screen 17, panel/design/sheets/screen-17-venue.svg;
// offers/SPEC_RU.md §2.1, §6, §8, §11): a separate web sign-in by mail, not
// the app — no identity, no bottom navigation. The way in is only the link
// from the letter, opened in the browser that asked; then the venues, each
// proved by the code from an envelope mailed to its address, and the offers,
// which a verified venue publishes at once and whole. Words from the sheet;
// where the sheet draws a control without words, the control's own name.

import { useEffect, useState } from "react";
import "../screens/place.css";
import { Button } from "../ui/Button.tsx";
import { Chip } from "../ui/Chip.tsx";
import {
  addVenue, answerComplaint, type Complaint, complaints, me, movePlace, notUs, type Offer, offers, openSession, orderEnvelope, type Place, publish, RADII, type Refusal, signIn,
  signUp, type Venue, venues, verify, when,
} from "./api.ts";
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

  return (
    <main className="screen cabinet" data-screen={`adv-${view}`}>
      {/* Sheet 17's strip: where you are, in mono, and the other section as a
          word — a separate web sign-in, no app navigation. */}
      <div className="cabinet-bar">
        <span className="cabinet-where">{location.host}{PATHS[view]}</span>
        {(view === "venues" || view === "offers" || view === "new-offer") && (
          <nav className="cabinet-nav" aria-label={say("web.cabinet.title")}>
            <Button type="button" icon="venue" aria-label={say("web.cabinet.tabVenues")} aria-current={view === "venues" ? "page" : undefined} onClick={() => setView("venues")} data-testid="adv-tab-venues" />
            <Button type="button" icon="offers" aria-label={say("web.cabinet.myOffers")} aria-current={view !== "venues" ? "page" : undefined} onClick={() => setView("offers")} data-testid="adv-tab-offers" />
          </nav>
        )}
      </div>
      {view === "loading" && <p className="muted" data-testid="loading">…</p>}
      {view === "sign-in" && <SignIn onSent={() => setView("sent")} onError={setError} />}
      {view === "sent" && (
        <>
          <header className="ui-header"><h1 className="ui-header-title">{say("web.cabinet.title")}</h1></header>
          <p data-testid="adv-sent">{say("web.cabinet.sent")}</p>
          <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="adv-sent-info"><p>{say("web.cabinet.linkOnce")}</p></Info></div>
        </>
      )}
      {view === "expired" && (
        <>
          <header className="ui-header"><h1 className="ui-header-title" data-testid="adv-expired">{say("web.cabinet.expired")}</h1></header>
          <div className="ui-info-row">
            <Info label={say("web.cabinet.title")} data-testid="adv-expired-info"><p>{say("web.cabinet.linkOnceSpent")}</p><p>{say("web.cabinet.limit")}</p></Info>
          </div>
          <Button kind="primary" type="button" icon="link" className="ui-wide" aria-label={say("web.cabinet.askAgain")} onClick={() => setView("sign-in")} data-testid="adv-again" />
        </>
      )}
      {view === "venues" && <Venues onError={setError} />}
      {view === "offers" && <Offers onNew={() => setView("new-offer")} onError={setError} />}
      {view === "new-offer" && <NewOffer onDone={() => setView("offers")} onError={setError} />}
      {error && <p className="error" data-testid="error">{error}</p>}
    </main>
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
      <header className="ui-header"><h1 className="ui-header-title">{say("web.cabinet.title")}</h1></header>
      <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="adv-sign-in-info"><p>{say("web.cabinet.linkOnly")}</p></Info></div>
      <label>
        {say("web.cabinet.email")}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="adv-email" autoComplete="email" />
      </label>
      <label>
        {say("web.cabinet.contact")}
        <input value={contact} onChange={(e) => setContact(e.target.value)} data-testid="adv-contact" />
      </label>
      <Button kind="primary" type="button" icon="link" className="ui-wide" aria-label={say("web.cabinet.getLink")} disabled={!email.includes("@") || busy} onClick={() => void go()} data-testid="adv-send" />
    </>
  );
}

// The place as three fields: latitude, longitude and the circle, 1000 m unless
// changed. Both numbers or neither.
function PlaceFields({ value, onChange, prefix }: { value: PlaceInput; onChange: (v: PlaceInput) => void; prefix: string }) {
  return (
    <fieldset className="place">
      <legend>{say("web.cabinet.point")}</legend>
      <label>
        {say("loc.lat")}
        <input inputMode="decimal" value={value.lat} onChange={(e) => onChange({ ...value, lat: e.target.value })} data-testid={`${prefix}-lat`} />
      </label>
      <label>
        {say("loc.lon")}
        <input inputMode="decimal" value={value.lon} onChange={(e) => onChange({ ...value, lon: e.target.value })} data-testid={`${prefix}-lon`} />
      </label>
      <label>
        {say("web.cabinet.radius")}
        <select value={value.radius} onChange={(e) => onChange({ ...value, radius: Number(e.target.value) })} data-testid={`${prefix}-radius`}>
          {RADII.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
    </fieldset>
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
      <header className="ui-header"><h1 className="ui-header-title">{say("web.cabinet.verification")}</h1></header>
      {rows === null ? <p className="muted">…</p> : rows.map((v) => <VenueRow key={v.id} venue={v} onChanged={load} onError={onError} />)}
      <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="adv-venues-info"><p>{say("web.cabinet.unverifiedNote")}</p></Info></div>
      <section className="add-venue">
        <label>
          {say("web.cabinet.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid="venue-name" />
        </label>
        <label>
          {say("web.cabinet.address")}
          <input value={address} onChange={(e) => setAddress(e.target.value)} data-testid="venue-address" />
        </label>
        <PlaceFields value={place} onChange={setPlace} prefix="venue" />
        <Button kind="primary" type="button" icon="new" className="ui-wide" aria-label={say("web.cabinet.addVenue")} disabled={!name.trim() || !address.trim()} onClick={() => void add()} data-testid="venue-add" />
      </section>
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
    <section className="place-not-us" data-testid="adv-not-us">
      <h2>{say("web.cabinet.notUsTitle")}</h2>
      <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="adv-not-us-info"><p>{say("web.cabinet.notUsNote")}</p></Info></div>
      <label className="place-field">
        {say("web.cabinet.envelopeCode")}
        <input value={code} onChange={(e) => setCode(e.target.value)} data-testid="adv-not-us-code" autoComplete="off" />
      </label>
      <Button kind="danger" type="button" icon="report" className="ui-wide" aria-label={say("web.cabinet.notUs")} disabled={busy || code.replace(/[\s-]/g, "").length !== 12} onClick={() => void send()} data-testid="adv-not-us-send" />
    </section>
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
    <article className="ui-card place-venue" data-testid="venue" data-status={venue.verification_status}>
      <h2>{venue.name}</h2>
      <p className="muted">{venue.address}</p>
      <p data-testid="venue-status">{STATUS[venue.verification_status] ?? venue.verification_status}</p>
      <p className="muted" data-testid="venue-place">
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
            <p className="muted">{say("web.cabinet.envelopeSent", { address: venue.address })}</p>
            <label>
              {say("web.cabinet.envelopeCode")}
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="venue-code" autoComplete="off" />
            </label>
            <Button kind="primary" type="button" icon="check" aria-label={say("web.cabinet.confirm")} disabled={code.replace(/[\s-]/g, "").length !== 12} onClick={() => void check()} data-testid="venue-verify" />
          </>
        )
        : <Button kind="secondary" type="button" icon="mail" className="ui-wide-half" aria-label={say("web.cabinet.orderEnvelope")} onClick={() => void order()} data-testid="venue-envelope" />)}
      {wrong && <p className="error" data-testid="venue-wrong">{wrong}</p>}
    </article>
  );
}

function Offers({ onNew, onError }: { onNew: () => void; onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<Offer[] | null>(null);
  useEffect(() => {
    void offers().then((a) => a.status === 200 ? setRows(a.body!.items) : onError(say("web.cabinet.notTaken", { status: a.status })));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <header className="ui-header">
        <h1 className="ui-header-title">{say("web.cabinet.myOffersTitle")}</h1>
        <Button kind="primary" type="button" icon="new" aria-label={say("web.cabinet.newOffer")} onClick={onNew} data-testid="offer-new" />
      </header>
      {rows?.map((o) => (
        <article key={o.id} className="ui-card place-offer" data-testid="adv-offer" data-status={o.status}>
          <p data-testid="adv-offer-state">{o.status === "active" ? say("web.cabinet.offerLive") : say("web.cabinet.offerExpired")}</p>
          <p className="discount place-discount">{o.discount_value}</p>
          <p>{o.offer_text}</p>
          <p className="muted">{say("web.cabinet.discountUntil", { until: when(o.discount_until) })}</p>
          <p className="muted">{say("web.cabinet.hits", { n: o.redirect_hits })}</p>
          {(o.complaints ?? 0) > 0 && (
            <p className="place-count" data-testid="adv-offer-complaints">
              <span className="muted">{say("web.cabinet.complaints")}</span> <span className="place-count-bad">{o.complaints}</span>
            </p>
          )}
          {o.external_url && <p className="muted" data-testid="adv-offer-link">{say("web.cabinet.link", { link: o.link.replace(/^https:\/\//, "") })}{o.link_disabled ? say("web.cabinet.linkOff") : ""}</p>}
        </article>
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
    <section className="place-complaints" data-testid="adv-complaints">
      <h2>{say("web.cabinet.complaintsTitle")}</h2>
      {rows.map((c) => <ComplaintRow key={c.id} complaint={c} onAnswered={load} onError={onError} />)}
    </section>
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
    <article className="ui-card ui-card-nested place-complaint" data-testid="adv-complaint" data-status={complaint.status}>
      <p className="muted">{when(`${complaint.date}T00:00:00Z`).split(",")[0]}</p>
      <p>{complaint.text}</p>
      {state && <p className={complaint.status === "pending" ? "warn" : "muted"}>{state}</p>}
      {complaint.response
        ? <p className="muted" data-testid="adv-complaint-response">{complaint.response}</p>
        : (
          <div className="place-answer">
            <label className="place-field">
              {say("web.cabinet.answerLabel")}
              <input value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} data-testid="adv-complaint-text" />
            </label>
            <Button kind="primary" type="button" icon="send" aria-label={say("web.cabinet.answer")} disabled={busy || !text.trim()} onClick={() => void send()} data-testid="adv-complaint-send" />
          </div>
        )}
    </article>
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
      <section className="place-preview" data-testid="offer-preview-card">
        <header className="ui-header"><h1 className="ui-header-title">{say("web.cabinet.previewTitle")}</h1></header>
        <article className="ui-card place-offer">
          <div className="row">
            <Chip label={say("web.cabinet.offerChip")} tone="accent" outline />
            <span className="place-discount">{discount.trim()}</span>
          </div>
          {at && <h2>{at.name}</h2>}
          <p>{text.trim()}</p>
          {conditions.trim() && <p className="muted">{say("web.cabinet.field.terms")}: {conditions.trim()}</p>}
          <p className="muted">{say("web.cabinet.discountUntil", { until: when(new Date(until).toISOString()) })}</p>
        </article>
        <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="offer-publish-info"><p>{say("web.cabinet.publishNote")}</p></Info></div>
        {refused && <p className="error" data-testid="offer-refused">{say("web.cabinet.refused", { reason: refused })}</p>}
        <Button kind="primary" type="button" icon="send" className="ui-wide" aria-label={say("web.cabinet.publish")} disabled={busy} onClick={() => void go()} data-testid="offer-publish" />
        <Button kind="secondary" type="button" icon="back" className="ui-wide" aria-label={say("web.cabinet.toForm")} onClick={() => setPreviewing(false)} data-testid="offer-to-form" />
      </section>
    );
  }
  if (done) {
    return (
      <section data-testid="offer-published">
        <header className="ui-header"><h1 className="ui-header-title">{say("web.cabinet.published")}</h1></header>
        <p>{say("web.cabinet.publishedNote")}</p>
        {done.external_url && <p data-testid="offer-published-link">{say("web.cabinet.link", { link: done.link.replace(/^https:\/\//, "") })}</p>}
        <p className="muted">{say("web.cabinet.cardLives", { until: when(done.discount_until) })}</p>
        <div className="ui-info-row"><Info label={say("web.cabinet.title")} data-testid="offer-published-info"><p>{say("web.cabinet.noEdit")}</p></Info></div>
        <Button kind="secondary" type="button" icon="offers" className="ui-wide" aria-label={say("web.cabinet.myOffers")} onClick={onDone} data-testid="offer-to-list" />
      </section>
    );
  }
  return (
    <>
      <header className="ui-header"><h1 className="ui-header-title">{say("web.cabinet.newOfferTitle")}</h1></header>
      {rows !== null && rows.length === 0 && <p className="muted" data-testid="offer-no-venue">{say("web.cabinet.noVenue")}</p>}
      {rows !== null && rows.length > 0 && (
        <>
          <label>
            {say("web.cabinet.field.venue")}
            <select value={venue} onChange={(e) => setVenue(e.target.value)} data-testid="offer-venue">
              {rows.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.address}</option>)}
            </select>
          </label>
          <label>
            {say("web.cabinet.field.text")}
            <input value={text} maxLength={128} onChange={(e) => setText(e.target.value)} data-testid="offer-text" />
          </label>
          <label>
            {say("web.cabinet.field.discount")}
            <input value={discount} maxLength={32} onChange={(e) => setDiscount(e.target.value)} data-testid="offer-discount" />
          </label>
          <label>
            {say("web.cabinet.field.terms")}
            <input value={conditions} maxLength={128} onChange={(e) => setConditions(e.target.value)} data-testid="offer-conditions" />
            <span className="muted">{say("web.cabinet.termsEmpty")}</span>
          </label>
          <label>
            {say("web.cabinet.field.discountTo")}
            <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} data-testid="offer-until" />
            <span className="muted">{say("web.cabinet.within90")}</span>
          </label>
          <label>
            {say("web.cabinet.field.promo")}
            <input value={promo} maxLength={64} onChange={(e) => setPromo(e.target.value)} data-testid="offer-promo" />
          </label>
          <label>
            {say("web.cabinet.field.url")}
            <input value={url} onChange={(e) => setUrl(e.target.value)} data-testid="offer-url" />
            <span className="muted">{say("web.cabinet.noShorteners")}</span>
          </label>
          <Button kind="secondary" type="button" icon="eye" className="ui-wide" aria-label={say("web.cabinet.preview")} disabled={!venue || !text.trim() || !discount.trim()} onClick={() => { setRefused(null); setPreviewing(true); }} data-testid="offer-preview" />
        </>
      )}
    </>
  );
}
