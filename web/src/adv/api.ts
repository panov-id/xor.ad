// The advertising cabinet's calls (A1; offers/SPEC_RU.md §2.1, §6, §8, §11;
// docs/api/openapi.yaml /adv/*; relay/node/src/routes/adv.ts). No identity and
// no signature: the cabinet is a web sign-in by mail, its session a cookie the
// node sets, and the node knows the storefront by the cabinet's Origin
// (adv.<storefront>). Lists come as {items}.

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

// A moment as the sheet writes it: "30 сентября, 18:00".
export const when = (iso: string | null): string => {
  if (!iso) return "?";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return `${new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" }).format(d)}, ${d.toTimeString().slice(0, 5)}`;
};
