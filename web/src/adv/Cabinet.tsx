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

type View = "loading" | "sign-in" | "sent" | "expired" | "venues" | "offers" | "new-offer";

const STATUS: Record<string, string> = {
  unverified: "не подтверждена",
  verified: "подтверждена",
  suspended: "приостановлена",
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
          <h1>Рекламный кабинет</h1>
          <p data-testid="adv-sent">если адрес зарегистрирован, письмо отправлено</p>
          <p className="muted">Ссылка одноразовая и живёт 15 минут; открывается в том же браузере, где её запросили.</p>
        </>
      )}
      {view === "expired" && (
        <>
          <h1 data-testid="adv-expired">Ссылка истекла</h1>
          <p className="muted">Ссылка одноразовая и живёт 15 минут; она гаснет при первом использовании. Открывается в том же браузере, где её запросили.</p>
          <p className="muted">Число запросов на один адрес ограничено. Письмо приходит на тот же адрес.</p>
          <button type="button" onClick={() => setView("sign-in")} data-testid="adv-again">запросить новую</button>
        </>
      )}
      {(view === "venues" || view === "offers" || view === "new-offer") && (
        <nav className="tabs">
          <button type="button" aria-current={view === "venues" ? "page" : undefined} onClick={() => setView("venues")} data-testid="adv-tab-venues">заведения</button>
          <button type="button" aria-current={view !== "venues" ? "page" : undefined} onClick={() => setView("offers")} data-testid="adv-tab-offers">мои офферы</button>
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
      if (answer.status === 429) return onError(`Слишком много запросов. Ещё раз через ${answer.retryAfter ?? "?"} с.`);
      onError(`Кабинет не принял (${answer.status}).`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Рекламный кабинет</h1>
      <p className="muted">Вход только по ссылке из письма.</p>
      <label>
        почта
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="adv-email" autoComplete="email" />
      </label>
      <label>
        контакт — для новой учётной записи
        <input value={contact} onChange={(e) => setContact(e.target.value)} data-testid="adv-contact" />
      </label>
      <button type="button" className="primary" disabled={!email.includes("@") || busy} onClick={() => void go()} data-testid="adv-send">получить ссылку</button>
    </>
  );
}

// The place as three fields: latitude, longitude and the circle, 1000 m unless
// changed. Both numbers or neither.
function PlaceFields({ value, onChange, prefix }: { value: PlaceInput; onChange: (v: PlaceInput) => void; prefix: string }) {
  return (
    <fieldset className="place">
      <legend>точка на карте</legend>
      <label>
        широта
        <input inputMode="decimal" value={value.lat} onChange={(e) => onChange({ ...value, lat: e.target.value })} data-testid={`${prefix}-lat`} />
      </label>
      <label>
        долгота
        <input inputMode="decimal" value={value.lon} onChange={(e) => onChange({ ...value, lon: e.target.value })} data-testid={`${prefix}-lon`} />
      </label>
      <label>
        радиус, м
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
  const load = () => venues().then((a) => a.status === 200 ? setRows(a.body!.items) : onError(`Кабинет не принял (${a.status}).`));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function add() {
    onError(null);
    const at = placeOf(place);
    if (at === "bad") return onError("Точка — это широта и долгота числами.");
    const made = await addVenue(name.trim(), address.trim(), at ?? undefined);
    if (made.status !== 201) return onError(made.body?.error?.message ?? `Кабинет не принял (${made.status}).`);
    setName("");
    setAddress("");
    setPlace(EMPTY_PLACE);
    await load();
  }
  return (
    <>
      <h1>Верификация</h1>
      {rows === null ? <p className="muted">…</p> : rows.map((v) => <VenueRow key={v.id} venue={v} onChanged={load} onError={onError} />)}
      <p className="muted">Пока точка не подтверждена, оффер опубликовать нельзя. У каждого заведения свой конверт.</p>
      <section className="add-venue">
        <label>
          название
          <input value={name} onChange={(e) => setName(e.target.value)} data-testid="venue-name" />
        </label>
        <label>
          адрес
          <input value={address} onChange={(e) => setAddress(e.target.value)} data-testid="venue-address" />
        </label>
        <PlaceFields value={place} onChange={setPlace} prefix="venue" />
        <button type="button" disabled={!name.trim() || !address.trim()} onClick={() => void add()} data-testid="venue-add">добавить заведение</button>
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
    if (at === null || at === "bad") return onError("Точка — это широта и долгота числами.");
    const answer = await movePlace(venue.id, at);
    if (answer.status !== 200) return onError(answer.body?.error?.message ?? `Кабинет не принял (${answer.status}).`);
    setMoving(false);
    onChanged();
  }
  async function order() {
    onError(null);
    const answer = await orderEnvelope(venue.id);
    if (answer.status !== 202) return onError(answer.body?.error?.message ?? `Кабинет не принял (${answer.status}).`);
    onChanged();
  }
  async function check() {
    onError(null);
    setWrong(null);
    const answer = await verify(venue.id, code);
    if (answer.status === 200) return onChanged();
    const refusal = answer.body as Refusal | null;
    if (answer.status === 422) {
      setWrong(`Код не подошёл. Осталось попыток: ${refusal?.error?.attempts_left ?? "?"}. После нескольких неверных код гасится, нужен новый конверт.`);
      return onChanged();
    }
    if (answer.status === 409) {
      setWrong("После нескольких неверных код гасится, нужен новый конверт.");
      return onChanged();
    }
    onError(refusal?.error?.message ?? `Кабинет не принял (${answer.status}).`);
  }
  return (
    <article className="venue" data-testid="venue" data-status={venue.verification_status}>
      <h2>{venue.name}</h2>
      <p className="muted">{venue.address}</p>
      <p data-testid="venue-status">{STATUS[venue.verification_status] ?? venue.verification_status}</p>
      <p className="muted" data-testid="venue-place">
        {venue.place ? `точка: ${venue.place.lat}, ${venue.place.lon} · ${venue.place.area_radius} м` : "точка не задана — офферы не опубликовать"}
      </p>
      {moving
        ? (
          <>
            {venue.verification_status === "verified" && <p className="warn">Новая точка снимет подтверждение: нужен новый конверт.</p>}
            <PlaceFields value={place} onChange={setPlace} prefix="venue-move" />
            <button type="button" onClick={() => void move()} data-testid="venue-move-save">сохранить точку</button>
          </>
        )
        : <button type="button" onClick={() => setMoving(true)} data-testid="venue-move">{venue.place ? "сдвинуть точку" : "задать точку"}</button>}
      {venue.verification_status === "unverified" && (venue.envelope_expires_at
        ? (
          <>
            <p className="muted">конверт с кодом отправлен на адрес {venue.address}; код живёт 30 дней</p>
            <label>
              код из конверта
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="venue-code" autoComplete="off" />
            </label>
            <button type="button" className="primary" disabled={code.replace(/[\s-]/g, "").length !== 12} onClick={() => void check()} data-testid="venue-verify">подтвердить</button>
          </>
        )
        : <button type="button" onClick={() => void order()} data-testid="venue-envelope">заказать конверт</button>)}
      {wrong && <p className="error" data-testid="venue-wrong">{wrong}</p>}
    </article>
  );
}

function Offers({ onNew, onError }: { onNew: () => void; onError: (e: string | null) => void }) {
  const [rows, setRows] = useState<Offer[] | null>(null);
  useEffect(() => {
    void offers().then((a) => a.status === 200 ? setRows(a.body!.items) : onError(`Кабинет не принял (${a.status}).`));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <h1>Мои офферы</h1>
      <button type="button" onClick={onNew} data-testid="offer-new">+ новый</button>
      {rows?.map((o) => (
        <article key={o.id} className="offer" data-testid="adv-offer" data-status={o.status}>
          <p data-testid="adv-offer-state">{o.status === "active" ? "в ленте" : "истёк"}</p>
          <p className="discount">{o.discount_value}</p>
          <p>{o.offer_text}</p>
          <p className="muted">скидка до {when(o.discount_until)}</p>
          <p className="muted">переходов по ссылке {o.redirect_hits}</p>
          {o.external_url && <p className="muted" data-testid="adv-offer-link">Ссылка: {o.link.replace(/^https:\/\//, "")}{o.link_disabled ? " · отключена" : ""}</p>}
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
      if (error?.reason === "duplicate") return setRefused("Дубль текста живого оффера. У вас уже висит оффер с этим текстом. Измените текст или дождитесь, пока прежний истечёт.");
      setRefused(error?.message ?? `Кабинет не принял (${answer.status}).`);
    } finally {
      setBusy(false);
    }
  }
  if (done) {
    return (
      <section data-testid="offer-published">
        <h1>Опубликовано</h1>
        <p>Оффер публикуется немедленно и целиком, включая ссылку, без премодерации.</p>
        {done.external_url && <p data-testid="offer-published-link">Ссылка: {done.link.replace(/^https:\/\//, "")}</p>}
        <p className="muted">Карточка живёт в ленте 4 часа 20 минут, скидка — до {when(done.discount_until)}.</p>
        <p className="muted">Опубликованный оффер не редактируется.</p>
        <button type="button" onClick={onDone} data-testid="offer-to-list">мои офферы</button>
      </section>
    );
  }
  return (
    <>
      <h1>Новый оффер</h1>
      {rows !== null && rows.length === 0 && <p className="muted" data-testid="offer-no-venue">Пока точка не подтверждена, оффер опубликовать нельзя.</p>}
      {rows !== null && rows.length > 0 && (
        <>
          <label>
            заведение
            <select value={venue} onChange={(e) => setVenue(e.target.value)} data-testid="offer-venue">
              {rows.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.address}</option>)}
            </select>
          </label>
          <label>
            текст
            <input value={text} maxLength={128} onChange={(e) => setText(e.target.value)} data-testid="offer-text" />
          </label>
          <label>
            скидка
            <input value={discount} maxLength={32} onChange={(e) => setDiscount(e.target.value)} data-testid="offer-discount" />
          </label>
          <label>
            условия
            <input value={conditions} maxLength={128} onChange={(e) => setConditions(e.target.value)} data-testid="offer-conditions" />
            <span className="muted">пусто — значит без ограничений</span>
          </label>
          <label>
            скидка до
            <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} data-testid="offer-until" />
            <span className="muted">не дальше 90 дней от публикации</span>
          </label>
          <label>
            промокод
            <input value={promo} maxLength={64} onChange={(e) => setPromo(e.target.value)} data-testid="offer-promo" />
          </label>
          <label>
            ссылка
            <input value={url} onChange={(e) => setUrl(e.target.value)} data-testid="offer-url" />
            <span className="muted">сокращатели не принимаются</span>
          </label>
          <p className="muted">Оффер публикуется сразу и целиком. Опубликованный оффер не редактируется: ни текст, ни скидка, ни условия.</p>
          {refused && <p className="error" data-testid="offer-refused">Публикация отклонена. {refused}</p>}
          <button type="button" className="primary" disabled={!venue || !text.trim() || !discount.trim() || busy} onClick={() => void go()} data-testid="offer-publish">опубликовать</button>
        </>
      )}
    </>
  );
}
