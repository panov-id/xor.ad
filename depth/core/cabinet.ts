// The advertising cabinet's calls and readings, moved out of web/src/adv/api.ts on 18.10.2026 so that the web's
// cabinet and the app shell's (app/src/screens/cabinet) read the node one way. The calls are unchanged; what is
// new is the pure part below them (the envelope code, the offer's face, the end of a discount), tested in
// app/src/screens/cabinet/cabinet.test.ts.
//
// The calls (A1; offers/SPEC_RU.md §2.1, §6, §8, §11; docs/api/openapi.yaml /adv/*; relay/node/src/routes/adv.ts):
// no identity and no signature — the cabinet is a web sign-in by mail, its session a cookie the node sets, and the
// node knows the storefront by the cabinet's Origin (adv.<storefront>). Lists come as {items}.
import { graphemeCount } from "./limits.ts";
import { parsePoint } from "./place.ts";

export type Answer<T> = { status: number; body: T | null; retryAfter?: number };

export type Venue = {
  id: string;
  name: string;
  address: string;
  verification_status: "unverified" | "verified" | "suspended" | string;
  verified_at: string | null;
  envelope_expires_at: string | null;
  // Where the venue's offers are shown (O2): without it the node refuses to publish.
  place: Place | null;
};

export type Place = { lat: number; lon: number; area_radius: number };
// The phrase's steps (relay/node/src/routes/adv.ts RADII).
export const RADII = [100, 300, 1000, 3000, 10000];

export type Offer = {
  id: string;
  venue_id: string;
  offer_text: string;
  discount_value: string;
  conditions: string | null;
  promo_code: string | null;
  external_url: string | null;
  redirect_hits: number;
  discount_until: string;
  status: "active" | "expired" | string;
  published_at: string;
  expires_at: string;
  link: string;
  link_disabled: boolean;
  // Complaints that the discount was not given, of every status (AdvOffer).
  complaints?: number;
};

// A complaint on one's own offer: text and date only (openapi AdvComplaint).
export type Complaint = {
  id: string;
  offer_id: string;
  text: string;
  date: string;
  status: "pending" | "resolved" | "rejected";
  response: string | null;
};

export type Refusal = { error?: { code?: string; message?: string; attempts_left?: number; reason?: string } };

async function call<T>(method: string, path: string, body?: unknown): Promise<Answer<T>> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: T | null = null;
  try {
    parsed = text ? JSON.parse(text) as T : null;
  } catch {
    parsed = null;
  }
  const retry = Number(response.headers.get("retry-after"));
  return { status: response.status, body: parsed, ...(Number.isFinite(retry) && retry > 0 ? { retryAfter: retry } : {}) };
}

export const signUp = (email: string, contact: string) => call("POST", "/adv/signup", { email, contact });
export const signIn = (email: string) => call("POST", "/adv/sign-in", { email });
export const openSession = (token: string) => call("POST", "/adv/session", { token });
export const signOut = () => call("POST", "/adv/sign-out");
export const me = () => call<{ email: string; email_confirmed: boolean; brand: string }>("GET", "/adv/me");
export const venues = () => call<{ items: Venue[] }>("GET", "/adv/venues");
export const addVenue = (name: string, address: string, place?: Place) =>
  call<Venue & Refusal>("POST", "/adv/venues", { name, address, ...place });
// Moving the place takes "verified" off: the envelope proved the old one.
export const movePlace = (id: string, place: Place) =>
  call<Venue & Refusal>("PATCH", `/adv/venues/${encodeURIComponent(id)}`, { ...place });
export const orderEnvelope = (id: string) => call<{ envelope_expires_at: string } & Refusal>("POST", `/adv/venues/${encodeURIComponent(id)}/envelope`);
export const verify = (id: string, code: string) => call<{ verification_status: string } & Refusal>("POST", `/adv/venues/${encodeURIComponent(id)}/verify`, { code });
export const offers = () => call<{ items: Offer[] }>("GET", "/adv/offers");
export const publish = (offer: {
  venue_id: string; offer_text: string; discount_value: string; discount_until: string;
  conditions?: string; promo_code?: string; external_url?: string;
}) => call<Offer & Refusal>("POST", "/adv/offers", offer);
// «Скидку не дали» on one's own offers, and one private answer to the moderator each (offers SPEC §10).
export const complaints = () => call<{ items: Complaint[] }>("GET", "/adv/complaints");
export const answerComplaint = (id: string, text: string) =>
  call<Refusal>("POST", `/adv/complaints/${encodeURIComponent(id)}/response`, { text });
// «Это не мы»: no session; always 204, a right code suspends that venue (SPEC §11).
export const notUs = (code: string) => call("POST", "/adv/venues/not-us", { code });

// A moment as the sheet writes it: "30 сентября, 18:00".
export const momentIn = (lang: string, iso: string | null): string => {
  if (!iso) return "?";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return `${new Intl.DateTimeFormat(lang, { day: "numeric", month: "long" }).format(d)}, ${d.toTimeString().slice(0, 5)}`;
};

// ── the pure part ──

/** The page is the cabinet: the host starts with adv. (a real deployment), or the path is the stand's /adv (web/src/App.tsx CABINET). */
export const isCabinet = (host: string, path: string): boolean => host.startsWith("adv.") || /^\/adv(\/|$)/.test(path);

/** The sign-in link is `/enter#<token>`: the token rides in the fragment, so no server log has it, and is spent on the first try.
 *  null: this is not that link; "": it is, and the token is not one (a mangled link). */
export function tokenFromLink(path: string, hash: string): string | null {
  if (!/\/enter\/?$/.test(path)) return null;
  const token = hash.replace(/^#/, "");
  return /^[0-9a-f]{64}$/.test(token) ? token : "";
}

// The envelope's code is twelve letters of an alphabet without look-alikes, shown as two groups of six
// (relay/node/src/routes/adv.ts envelopeCode / normalCode): what the node takes is the bare twelve.
export const CODE_LENGTH = 12;
/** What a person typed or pasted as the code: capitals, no spaces or dashes, at most the twelve. */
export const bareCode = (typed: string): string => typed.toUpperCase().replace(/[\s-]/g, "").slice(0, CODE_LENGTH);
export const codeReady = (typed: string): boolean => bareCode(typed).length === CODE_LENGTH;

// The offer's text is 128 graphemes at most (the node: text(…, 128)); the sheet's counter says how many are left.
export const OFFER_TEXT_MAX = 128;
export const textLeft = (text: string, max: number = OFFER_TEXT_MAX): number => Math.max(0, max - graphemeCount(text));

// A venue's point as a person pastes it from a map («41.6900, 44.8010»), with the circle's radius: both or none.
// "none": nothing typed; "bad": typed, and not a point.
export function placeFrom(typed: string, radius: number): Place | null | "bad" {
  if (!typed.trim()) return null;
  const at = parsePoint(typed);
  return at ? { lat: at.lat, lon: at.lon, area_radius: radius } : "bad";
}

// A discount's end is a day, and the offer says "until 23:00" of it; the node wants a moment in the future, within
// 90 days (relay/node/src/routes/adv.ts DISCOUNT_MAX_DAYS). The hour is the evening of that day, local.
export const DISCOUNT_MAX_DAYS = 90;
export const DISCOUNT_HOUR = 23;
const DAY_MS = 86_400_000;

/** A local "YYYY-MM-DD" for a day `days` ahead of `now`. */
export function dayAhead(days: number, now: number = Date.now()): string {
  const d = new Date(now + days * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** The moment a chosen day's discount ends: 23:00 of that day, local (null for something that is not a day). */
export function discountEnd(day: string): Date | null {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), DISCOUNT_HOUR);
  return Number.isNaN(end.getTime()) ? null : end;
}
/** Why a chosen day cannot be published, before the node says it: "past" (already over), "far" (beyond 90 days), or null. */
export function endProblem(day: string, now: number = Date.now()): "past" | "far" | "bad" | null {
  const end = discountEnd(day);
  if (!end) return "bad";
  if (end.getTime() <= now) return "past";
  return end.getTime() > now + DISCOUNT_MAX_DAYS * DAY_MS ? "far" : null;
}

/** HH:MM of a moment, local: the pill's "until 23:00". */
export const clock = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "?" : d.toTimeString().slice(0, 5);
};

// From this many complaints on an offer the count is told as "a lot", not only red (the web's threshold).
export const MANY_COMPLAINTS = 3;

/** The discount as the card writes it: the author's free text, any leading minus dropped, ours added (web ui/offer.ts). */
export const discountLabel = (discount: string): string => "−" + discount.trim().replace(/^[-−–—‒﹣－]+\s*/u, "");

export type OfferFace = {
  live: boolean;
  big: string;          // «−20%»
  text: string;
  venue: string;        // the venue's name, "" when the list does not have it
  until: string;        // «23:00»
  visits: number;
  complaints: number;
  many: boolean;
};
/** One of the advertiser's offers as the sheet draws it: live ones large, expired ones as a line with the counts. */
export function offerFace(o: Offer, venueNames: ReadonlyMap<string, string>): OfferFace {
  return {
    live: o.status === "active",
    big: discountLabel(o.discount_value),
    text: o.offer_text,
    venue: venueNames.get(o.venue_id) ?? "",
    until: clock(o.discount_until),
    visits: o.redirect_hits,
    complaints: o.complaints ?? 0,
    many: (o.complaints ?? 0) >= MANY_COMPLAINTS,
  };
}
/** Live offers first, each group newest first. */
export const inOrder = (items: readonly Offer[]): Offer[] =>
  [...items].sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || Date.parse(b.published_at) - Date.parse(a.published_at));

export type VenueState = "unverified" | "verified" | "suspended";
/** What a venue is waiting for: the envelope ordered ("code"), not yet ("order"), or nothing ("done"). */
export function venueStep(v: Pick<Venue, "verification_status" | "envelope_expires_at">): "done" | "order" | "code" {
  if (v.verification_status !== "unverified") return "done";
  return v.envelope_expires_at ? "code" : "order";
}
export const venueState = (status: string): VenueState => (status === "verified" || status === "suspended" ? status : "unverified");

/** A refusal in the node's own words when it gave any, else null (the screen says the status). */
export const refusalMessage = (answer: Answer<unknown>): string | null =>
  (answer.body as Refusal | null)?.error?.message ?? null;
