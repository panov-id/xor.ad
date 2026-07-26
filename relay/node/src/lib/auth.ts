// Panel auth — passwordless magic link + stateless signed session (JWT HS256).
// Users live in Bunny Storage (panel/<env>/users/<sha256(email)>.json); a login
// request drops a one-time token (panel/<env>/magic/<token>.json) and emails a
// link. No membership is leaked: a request for an unknown email is a silent no-op.

import { config } from "../config.ts";
import { isRole, type Role } from "../access/index.ts";
import { del, get, put } from "./storage.ts";
import { sha256hex } from "./hash.ts";
import { sign, verify } from "./jwt.ts";
import { sendPanelLink } from "./mailer.ts";

// Roles are owned by the access core; re-exported so route modules keep importing
// the panel vocabulary from one place.
export type { Role };

export interface PanelUser {
  email: string;
  role: Role;
  // Which tenant this operator belongs to. Absent in records written before
  // tenancy, and read as null — the platform scope they already had.
  brand: string | null;
  created_at: string;
}

const TOKEN_TTL_MS = 15 * 60_000;
const SESSION_TTL_S = 7 * 24 * 3600;

export const usersDir = (): string => `panel/${config.envName}/users`;
const userKey = async (email: string): Promise<string> =>
  `${usersDir()}/${await sha256hex(email.trim().toLowerCase())}.json`;
const magicKey = (token: string): string => `panel/${config.envName}/magic/${token}.json`;

export async function getUser(email: string): Promise<PanelUser | null> {
  return await get<PanelUser>(await userKey(email));
}

export async function requestMagicLink(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!e) return;
  if (!await getUser(e)) return; // invite-only: never reveal membership
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await put(magicKey(token), { email: e, exp: Date.now() + TOKEN_TTL_MS });
  const link = `${config.panel.url}/auth/callback?token=${token}`;
  await sendPanelLink(e, link);
}

// Verify a magic token (one-time, unexpired) and mint a session JWT.
export async function redeem(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const m = await get<{ email: string; exp: number }>(magicKey(token));
  if (!m) return null;
  await del(magicKey(token)); // one-time use — burn it regardless of validity
  if (Date.now() > m.exp) return null;
  const user = await getUser(m.email);
  if (!user) return null;
  return await sign(
    {
      sub: user.email,
      role: user.role,
      // Records predating tenancy carry no brand. Baked into the token rather
      // than read per request: moving an operator to another brand therefore
      // takes effect on their next sign-in, not immediately. Acceptable because
      // moving one is rare and the session is short; if that stops being true,
      // this is the line to revisit.
      brand: user.brand ?? null,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S,
    },
    config.session.secret,
  );
}

// Resolve the caller from the Bearer session; null if unauthenticated. Says
// nothing about what the caller may do — that is requirePermission's job
// (lib/access_guard.ts), so there is one place where access is decided.
export async function authed(req: Request): Promise<PanelUser | null> {
  if (!config.session.secret) return null;
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const claims = await verify(jwt, config.session.secret);
  if (!claims) return null;
  // A session carrying a role that no longer exists is rejected at the door
  // rather than trusted through an unchecked cast.
  if (!isRole(claims.role)) return null;
  return {
    email: claims.sub,
    role: claims.role,
    // A session predating tenancy carries no brand — platform scope, same as
    // the user record it was minted from.
    brand: typeof claims.brand === "string" ? claims.brand : null,
    created_at: "",
  };
}
