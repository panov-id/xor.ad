// Panel auth — passwordless magic link + stateless signed session (JWT HS256).
// Users live in Bunny Storage (panel/<env>/users/<sha256(email)>.json); a login
// request drops a one-time token (panel/<env>/magic/<token>.json) and emails a
// link. No membership is leaked: a request for an unknown email is a silent no-op.

import { config } from "../config.ts";
import { isRole, type Role } from "../access/index.ts";
import { del, get, list, put } from "./storage.ts";
import { sha256hex } from "./hash.ts";
import { sign, verify } from "./jwt.ts";
import { sendPanelInvite, sendPanelLink } from "./mailer.ts";
import { log } from "./log.ts";

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
// An invitation is read out of an inbox, not clicked within the minute a
// sign-in link expects. Same token and the same redeem path — only the deadline
// differs, so nothing else in the flow has to learn about invitations.
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const SESSION_TTL_S = 7 * 24 * 3600;

export const usersDir = (): string => `panel/${config.envName}/users`;
const userKey = async (email: string): Promise<string> =>
  `${usersDir()}/${await sha256hex(email.trim().toLowerCase())}.json`;
const magicKey = (token: string): string => `panel/${config.envName}/magic/${token}.json`;

export async function getUser(email: string): Promise<PanelUser | null> {
  return await get<PanelUser>(await userKey(email));
}

async function issueToken(email: string, ttlMs: number): Promise<string> {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await put(magicKey(token), { email, exp: Date.now() + ttlMs });
  return token;
}

const linkFor = (token: string): string => `${config.panel.url}/auth/callback?token=${token}`;

export async function requestMagicLink(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!e) return;
  if (!await getUser(e)) return; // invite-only: never reveal membership
  await sendPanelLink(e, linkFor(await issueToken(e, TOKEN_TTL_MS)));
}

// Onboarding. Unlike a sign-in request this one is allowed to throw: the
// platform has just created this operator, so there is no membership to keep
// secret, and an invitation that quietly failed to send is worse than an error —
// the person would be waiting for a letter nobody is going to send again.
export async function sendInvitation(user: PanelUser): Promise<void> {
  const token = await issueToken(user.email, INVITE_TTL_MS);
  try {
    await sendPanelInvite(user.email, linkFor(token), user.brand);
  } catch (error) {
    // A letter that never went out must not leave a week-long key behind it.
    // (A sign-in link is not cleaned up the same way: it lives fifteen minutes
    // and its send is best-effort by design, so there is nothing worth the
    // extra write.)
    await del(magicKey(token));
    throw error;
  }
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
      // Named in the token, so a session cannot travel between environments
      // even if their secrets ever coincide again. Belt beside the braces: the
      // secrets are separate now, and this turns a mix-up into a refusal rather
      // than into a working session on the wrong node.
      env: config.envName,
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
  // A token from another environment is not a token from here. Sessions minted
  // before this claim existed carry nothing and fail on the same line, which is
  // intended: they were signed with the secret every environment shared, and
  // that secret is exactly what is being retired.
  if (claims.env !== config.envName) return null;
  return {
    email: claims.sub,
    role: claims.role,
    // A session predating tenancy carries no brand — platform scope, same as
    // the user record it was minted from.
    brand: typeof claims.brand === "string" ? claims.brand : null,
    created_at: "",
  };
}

// Expired sign-in links, which nothing removed.
//
// `issueToken` writes one object per request and `redeem` deletes it on use. A
// link that is never clicked — a mistyped address, a change of mind, or every
// request in a flood — was written and then kept for ever: storage bought one
// object at a time, each holding an operator's email address in clear.
//
// The general object prune cannot do this. It works by object age and refuses
// any window shorter than a week (tools/prune_objects.ts, MINIMUM_DAYS), while a
// sign-in link lives fifteen minutes. So the window here is not age at all — it
// is the token's own `exp`, the only honest statement of when the object stopped
// meaning anything. It lives in this file because this is where the key layout
// is owned, and because reaching storage directly is allowed here and nowhere
// else (test/imports.test.ts).
export interface MagicPruneResult {
  removed: number;
  kept: number;
}

// A grace period past `exp`: a token whose deadline passed a minute ago may
// still be in flight towards `redeem`, and deleting it early turns "your link
// has expired" into "invalid link" — the same outcome in a more alarming word.
const MAGIC_GRACE_MS = 60 * 60 * 1000;

export async function pruneMagicLinks(now = Date.now()): Promise<MagicPruneResult> {
  const dir = `panel/${config.envName}/magic`;
  let removed = 0;
  let kept = 0;
  for (const name of await list(dir)) {
    const path = `${dir}/${name}`;
    const token = await get<{ exp?: number }>(path);
    // Unreadable or shapeless: `redeem` requires an `exp`, so such an object can
    // never be redeemed and keeping it keeps nothing. It goes with the expired.
    const exp = typeof token?.exp === "number" ? token.exp : 0;
    if (exp + MAGIC_GRACE_MS < now) {
      await del(path);
      removed += 1;
    } else {
      kept += 1;
    }
  }
  log("info", "pruned magic links", { removed, kept });
  return { removed, kept };
}
