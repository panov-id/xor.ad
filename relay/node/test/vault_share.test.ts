// How the sealing key is derived, and the two properties the derivation owes.
//
// Both come from the review panel of 2026-09-20 (protocols lens), which found a
// single SHA-256 over the environment value and no requirement stated for that
// value anywhere. HKDF replaced the bare hash on 2026-09-21; this suite holds
// what that has to mean, because a derivation is the kind of code that keeps
// working while meaning something different.

import { assert, assertEquals } from "jsr:@std/assert@1";

Deno.env.set("VAULT_SHARE_KEY", "a-test-key-of-no-particular-strength");
const { sealShare, openShare, forgetVaultKey, configured } = await import("../src/lib/vault_share.ts");
const { config } = await import("../src/config.ts");

const mutable = config as unknown as { vaultShareKey: string };

Deno.test("a sealed share comes back, and is not the bytes that went in", async () => {
  const share = crypto.getRandomValues(new Uint8Array(32));
  const sealed = await sealShare(share);
  assert(sealed.length > share.length, "the sealed form is not longer than the plain one");
  assertEquals(await openShare(sealed), share);
});

Deno.test("the derivation is deterministic, because the pool depends on it", async () => {
  // Any node of the pool may answer the next request for the same share, so two
  // processes with the same environment value must derive the same key. This is
  // the property the old bare hash was justified by, and HKDF keeps it.
  const share = crypto.getRandomValues(new Uint8Array(32));
  const sealed = await sealShare(share);

  forgetVaultKey();
  const reopened = await openShare(sealed);
  assertEquals(reopened, share, "a second derivation produced a different key");
});

Deno.test("another environment value opens nothing", async () => {
  const share = crypto.getRandomValues(new Uint8Array(32));
  const sealed = await sealShare(share);

  const held = mutable.vaultShareKey;
  mutable.vaultShareKey = "a-different-key-entirely";
  forgetVaultKey();
  // Not a throw and not a wrong answer: GCM authenticates, so the node can tell
  // "wrong key" from "tampered row" and says so by answering null.
  assertEquals(await openShare(sealed), null, "a foreign key opened the share");

  mutable.vaultShareKey = held;
  forgetVaultKey();
  assertEquals(await openShare(sealed), share, "the right key stopped working");
});

Deno.test("the derived key is not the bare hash of the value", async () => {
  // The point of HKDF here is domain separation: the same environment value used
  // for some other purpose must not yield these bytes. If someone ever replaces
  // the derivation with a plain digest again — the shape this file exists to
  // prevent — this case is what goes red.
  const value = new TextEncoder().encode(mutable.vaultShareKey);
  const bare = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  const bareKey = await crypto.subtle.importKey("raw", bare, "AES-GCM", false, ["encrypt", "decrypt"]);

  const share = crypto.getRandomValues(new Uint8Array(32));
  const sealed = await sealShare(share);
  const nonce = sealed.slice(0, 12);
  const body = sealed.slice(12);

  const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, bareKey, body)
    .then((plain) => new Uint8Array(plain))
    .catch(() => null);
  assertEquals(opened, null, "the sealing key is still sha256 of the environment value");
});

Deno.test("without a value the module refuses rather than sealing in the clear", () => {
  const held = mutable.vaultShareKey;
  mutable.vaultShareKey = "";
  assertEquals(configured(), false);
  mutable.vaultShareKey = held;
});
