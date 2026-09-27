// The venue's cabinet (A1; screen 17, panel/design/sheets/screen-17-venue.svg;
// offers/SPEC_RU.md §2.1, §6, §8, §11): a separate web sign-in by mail, not
// the app — no identity, no bottom navigation. The way in is only the link
// from the letter, opened in the browser that asked; then the venues, each
// proved by the code from an envelope mailed to its address, and the offers,
// which a verified venue publishes at once and whole. Words from the sheet;
// where the sheet draws a control without words, the control's own name.

import { useEffect, useState } from "react";
import {
  addVenue, me, movePlace, type Offer, offers, openSession, orderEnvelope, type Place, publish, RADII, type Refusal, signIn,
  signUp, type Venue, venues, verify, when,
} from "./api.ts";
import { say } from "../locales/say.ts";

type View = "loading" | "sign-in" | "sent" | "expired" | "venues" | "offers" | "new-offer";

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
      <p className="brand">adv</p>
      {view === "loading" && <p className="muted" data-testid="loading">…</p>}
      {view === "sign-in" && <SignIn onSent={() => setView("sent")} onError={setError} />}
      {view === "sent" && (
        <>
          <h1>{say("web.cabinet.title")}</h1>
          <p data-testid="adv-sent">{say("web.cabinet.sent")}</p>
          <p className="muted">{say("web.cabinet.linkOnce")}</p>
        </>
      )}
      {view === "expired" && (
        <>
          <h1 data-testid="adv-expired">{say("web.cabinet.expired")}</h1>
          <p className="muted">{say("web.cabinet.linkOnceSpent")}</p>
          <p className="muted">{say("web.cabinet.limit")}</p>
          <button type="button" onClick={() => setView("sign-in")} data-testid="adv-again">{say("web.cabinet.askAgain")}</button>
        </>
      )}
      {(view === "venues" || view === "offers" || view === "new-offer") && (
        <nav className="tabs">
          <button type="button" aria-current={view === "venues" ? "page" : undefined} onClick={() => setView("venues")} data-testid="adv-tab-venues">{say("web.cabinet.tabVenues")}</button>
          <button type="button" aria-current={view !== "venues" ? "page" : undefined} onClick={() => setView("offers")} data-testid="adv-tab-offers">{say("web.cabinet.myOffers")}</button>
        </nav>
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
      <h1>{say("web.cabinet.title")}</h1>
      <p className="muted">{say("web.cabinet.linkOnly")}</p>
      <label>
        {say("web.cabinet.email")}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="adv-email" autoComplete="email" />
      </label>
      <label>
        {say("web.cabinet.contact")}
        <input value={contact} onChange={(e) => setContact(e.target.value)} data-testid="adv-contact" />
      </label>
      <button type="button" className="primary" disabled={!email.includes("@") || busy} onClick={() => void go()} data-testid="adv-send">{say("web.cabinet.getLink")}</button>
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
      <h1>{say("web.cabinet.verification")}</h1>
      {rows === null ? <p className="muted">…</p> : rows.map((v) => <VenueRow key={v.id} venue={v} onChanged={load} onError={onError} />)}
      <p className="muted">{say("web.cabinet.unverifiedNote")}</p>
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
        <button type="button" disabled={!name.trim() || !address.trim()} onClick={() => void add()} data-testid="venue-add">{say("web.cabinet.addVenue")}</button>
      </section>
    </>
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
    <article className="venue" data-testid="venue" data-status={venue.verification_status}>
      <h2>{venue.name}</h2>
      <p className="muted">{venue.address}</p>
      <p data-testid="venue-status">{STATUS[venue.verification_status] ?? venue.verification_status}</p>
      <p className="muted" data-testid="venue-place">
        {venue.place ? say("web.cabinet.placeAt", { lat: venue.place.lat, lon: venue.place.lon, radius: venue.place.area_radius }) : say("web.cabinet.placeNone")}
      </p>
      {moving
        ? (
          <>
            {venue.verification_status === "verified" && <p className="warn">{say("web.cabinet.moveWarn")}</p>}
            <PlaceFields value={place} onChange={setPlace} prefix="venue-move" />
            <button type="button" onClick={() => void move()} data-testid="venue-move-save">{say("web.cabinet.savePoint")}</button>
          </>
        )
        : <button type="button" onClick={() => setMoving(true)} data-testid="venue-move">{venue.place ? say("web.cabinet.movePoint") : say("web.cabinet.setPoint")}</button>}
      {venue.verification_status === "unverified" && (venue.envelope_expires_at
        ? (
          <>
            <p className="muted">{say("web.cabinet.envelopeSent", { address: venue.address })}</p>
            <label>
              {say("web.cabinet.envelopeCode")}
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="venue-code" autoComplete="off" />
            </label>
            <button type="button" className="primary" disabled={code.replace(/[\s-]/g, "").length !== 12} onClick={() => void check()} data-testid="venue-verify">{say("web.cabinet.confirm")}</button>
          </>
        )
        : <button type="button" onClick={() => void order()} data-testid="venue-envelope">{say("web.cabinet.orderEnvelope")}</button>)}
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
      <h1>{say("web.cabinet.myOffersTitle")}</h1>
      <button type="button" onClick={onNew} data-testid="offer-new">{say("web.cabinet.newOffer")}</button>
      {rows?.map((o) => (
        <article key={o.id} className="offer" data-testid="adv-offer" data-status={o.status}>
          <p data-testid="adv-offer-state">{o.status === "active" ? say("web.cabinet.offerLive") : say("web.cabinet.offerExpired")}</p>
          <p className="discount">{o.discount_value}</p>
          <p>{o.offer_text}</p>
          <p className="muted">{say("web.cabinet.discountUntil", { until: when(o.discount_until) })}</p>
          <p className="muted">{say("web.cabinet.hits", { n: o.redirect_hits })}</p>
          {o.external_url && <p className="muted" data-testid="adv-offer-link">{say("web.cabinet.link", { link: o.link.replace(/^https:\/\//, "") })}{o.link_disabled ? say("web.cabinet.linkOff") : ""}</p>}
        </article>
      ))}
    </>
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
  if (done) {
    return (
      <section data-testid="offer-published">
        <h1>{say("web.cabinet.published")}</h1>
        <p>{say("web.cabinet.publishedNote")}</p>
        {done.external_url && <p data-testid="offer-published-link">{say("web.cabinet.link", { link: done.link.replace(/^https:\/\//, "") })}</p>}
        <p className="muted">{say("web.cabinet.cardLives", { until: when(done.discount_until) })}</p>
        <p className="muted">{say("web.cabinet.noEdit")}</p>
        <button type="button" onClick={onDone} data-testid="offer-to-list">{say("web.cabinet.myOffers")}</button>
      </section>
    );
  }
  return (
    <>
      <h1>{say("web.cabinet.newOfferTitle")}</h1>
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
          <p className="muted">{say("web.cabinet.publishNote")}</p>
          {refused && <p className="error" data-testid="offer-refused">{say("web.cabinet.refused", { reason: refused })}</p>}
          <button type="button" className="primary" disabled={!venue || !text.trim() || !discount.trim() || busy} onClick={() => void go()} data-testid="offer-publish">{say("web.cabinet.publish")}</button>
        </>
      )}
    </>
  );
}
