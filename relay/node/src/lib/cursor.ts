// The page cursor of GET /feed, GET /likes and GET /tables, sealed (§8.11; the owner's
// decision of 2026-09-24).
//
// The cursor was `<microseconds>_<id>` in the clear: the last row's instant to
// the microsecond. For the feed that is another person's publication time, and
// with a fixed span it is their end to the microsecond — the very thing the
// card stopped showing on 2026-09-24. So the pair travels sealed: AES-256-GCM
// under a key every node of the pool derives the same way, and a cursor the
// node did not issue — edited, forged, or one list's handed to the other —
// fails to open and is answered 400.
//
// The key is VAULT_SHARE_KEY through HKDF with its own salt and info
// (lib/vault_share.ts explains why HKDF and why a constant salt): already the
// pool's shared secret, one the wizard generates and will not deploy without.
// A rotation keeps every cursor in hand while VAULT_SHARE_KEY_PREVIOUS is set;
// after it goes, an old `after` answers 400 and the list starts again.
//
// The list's name is the GCM additional data: a feed cursor does not open as a
// likes cursor. Layout: nonce(12) ‖ ciphertext(8 + 16) ‖ tag(16), base64url.

import { config } from "../config.ts";
import { base64urlToBytes, bytesToBase64url } from "./identity_auth.ts";
import { derivedKey, forgetVaultKey, openingKeys, type Which } from "./vault_share.ts";

export type CursorList = "feed" | "likes" | "tables";

const NONCE_BYTES = 12;
const KEY_SALT = new TextEncoder().encode("xor.ad/page-cursor/v1");
const KEY_INFO = new TextEncoder().encode("page cursor sealing key, AES-256-GCM");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Sixteen digits of microseconds reach the year 2286; more overflowed bigint
// in the database (review panel 23.09.2026).
const MICROS = /^[0-9]{1,16}$/;

export function cursorConfigured(): boolean {
  return config.vaultShareKey.length > 0;
}

// Rotation (owner /go 07.11.2026): issued under the current key, opened under
// either while VAULT_SHARE_KEY_PREVIOUS is set, so a page in hand survives it.
function key(which: Which = "current"): Promise<CryptoKey> {
  if (!cursorConfigured()) throw new Error("VAULT_SHARE_KEY is not set — a cursor must not travel in the clear");
  return derivedKey(which, KEY_SALT, KEY_INFO, "AES-GCM");
}

// Only for tests that change the environment between cases.
export function forgetCursorKey(): void {
  forgetVaultKey();
}

function uuidBytes(id: string): Uint8Array {
  const hex = id.replaceAll("-", "");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function uuidText(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// `micros` stays digits end to end — never a Date, never a timestamp-looking
// string (routes/feed.ts says why).
export async function sealCursor(list: CursorList, micros: string, id: string): Promise<string> {
  if (!MICROS.test(micros) || !UUID.test(id)) throw new Error("not a cursor pair");
  const plain = new Uint8Array(24);
  new DataView(plain.buffer).setBigUint64(0, BigInt(micros));
  plain.set(uuidBytes(id), 8);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(list) },
    await key(),
    plain,
  ));
  const out = new Uint8Array(NONCE_BYTES + sealed.length);
  out.set(nonce);
  out.set(sealed, NONCE_BYTES);
  return bytesToBase64url(out);
}

// null for anything this node's pool did not issue for this list.
export async function openCursor(list: CursorList, cursor: string): Promise<{ micros: string; id: string } | null> {
  if (!/^[A-Za-z0-9_-]{70}$/.test(cursor)) return null;
  const bytes = base64urlToBytes(cursor);
  if (!bytes || bytes.length !== NONCE_BYTES + 24 + 16) return null;
  // Seventy characters carry four spare bits: fifteen other spellings of the
  // last one decode to the same bytes. Only the spelling issued is a cursor
  // (verifier, 2026-09-24).
  if (bytesToBase64url(bytes) !== cursor) return null;
  let plain: Uint8Array | null = null;
  for (const which of openingKeys()) {
    try {
      plain = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes.slice(0, NONCE_BYTES), additionalData: new TextEncoder().encode(list) },
        await key(which),
        bytes.slice(NONCE_BYTES),
      ));
      break;
    } catch {
      // the next key
    }
  }
  if (!plain) return null;
  const micros = new DataView(plain.buffer).getBigUint64(0).toString();
  if (!MICROS.test(micros)) return null;
  return { micros, id: uuidText(plain.slice(8)) };
}
