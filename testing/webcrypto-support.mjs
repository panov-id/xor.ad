// Does WebCrypto do Ed25519 in the browsers people actually use?
//
// chat_RU.md §8.2 picks Ed25519 for request signatures and says so out loud:
// "Ed25519 в WebCrypto появился недавно, и старые браузеры его могут не знать.
// Это надо померить на живых браузерах — и если окажется, что заметная доля не
// умеет, выбор меняется на ECDSA P-256."
//
// Measured here, not argued: every operation the spec needs is actually run.
// The fallback (ECDSA P-256) and the key agreement partners (X25519, ECDH
// P-256) are run alongside, because choosing the signature algorithm chooses
// the key-agreement one with it (§8.13 derives K from an ECDH).
import { chromium, firefox, webkit } from "playwright";

const PROBE = async () => {
  const out = { ops: {} };

  const record = async (name, run) => {
    try {
      await run();
      out.ops[name] = "ok";
    } catch (error) {
      out.ops[name] = `нет: ${String(error && error.name || error).slice(0, 40)}`;
    }
  };

  const encoder = new TextEncoder();
  const message = encoder.encode("GET\n/feed\n0000\n1787049339");

  // --- Ed25519: the whole path the spec needs ---------------------------
  let edPair;
  await record("Ed25519 generateKey", async () => {
    edPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  });
  await record("Ed25519 sign", async () => {
    out.signature = (await crypto.subtle.sign({ name: "Ed25519" }, edPair.privateKey, message)).byteLength;
  });
  await record("Ed25519 verify", async () => {
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, edPair.privateKey, message);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, edPair.publicKey, signature, message);
    if (!ok) throw new Error("verify returned false");
  });
  await record("Ed25519 export raw public", async () => {
    out.publicKeyBytes = (await crypto.subtle.exportKey("raw", edPair.publicKey)).byteLength;
  });
  await record("Ed25519 import spki", async () => {
    const spki = await crypto.subtle.exportKey("spki", edPair.publicKey);
    await crypto.subtle.importKey("spki", spki, { name: "Ed25519" }, true, ["verify"]);
  });
  // §8.13: the long-term key has to survive a device move, and wrapKey demands
  // an extractable key — so a non-extractable-only implementation would not do.
  await record("Ed25519 wrapKey", async () => {
    const wrapping = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["wrapKey", "unwrapKey"]);
    await crypto.subtle.wrapKey("pkcs8", edPair.privateKey, wrapping, {
      name: "AES-GCM", iv: crypto.getRandomValues(new Uint8Array(12)),
    });
  });

  // --- the fallback the spec names --------------------------------------
  await record("ECDSA P-256 sign+verify", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, message);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, signature, message);
    if (!ok) throw new Error("verify returned false");
  });

  // --- key agreement: whichever signature we pick brings its partner -----
  await record("X25519 deriveBits", async () => {
    const mine = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    const theirs = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    await crypto.subtle.deriveBits({ name: "X25519", public: theirs.publicKey }, mine.privateKey, 256);
  });
  await record("ECDH P-256 deriveBits", async () => {
    const mine = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const theirs = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    await crypto.subtle.deriveBits({ name: "ECDH", public: theirs.publicKey }, mine.privateKey, 256);
  });

  return out;
};

const engines = [["Chromium", chromium], ["Firefox", firefox], ["WebKit", webkit]];
const results = [];

for (const [label, engine] of engines) {
  const browser = await engine.launch();
  const page = await browser.newPage();
  // A file:// or about:blank page has no secure context in every engine; serve
  // from https to be sure crypto.subtle exists at all.
  await page.goto("https://example.com/", { waitUntil: "domcontentloaded" }).catch(() => {});
  const hasSubtle = await page.evaluate(() => typeof crypto !== "undefined" && !!crypto.subtle);
  const version = browser.version();
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const measured = hasSubtle ? await page.evaluate(PROBE) : { ops: { "crypto.subtle": "отсутствует" } };
  results.push({ label, version, userAgent, ...measured });
  await browser.close();
}

const names = Object.keys(results.find((r) => Object.keys(r.ops).length > 1)?.ops ?? {});
const width = Math.max(...names.map((n) => n.length));

console.log("");
for (const result of results) {
  console.log(`${result.label} ${result.version}`);
  console.log(`  ${result.userAgent.slice(0, 100)}`);
}
console.log("");
console.log(`${"операция".padEnd(width)}  ${results.map((r) => r.label.padEnd(24)).join("")}`);
for (const name of names) {
  const cells = results.map((r) => {
    const value = r.ops[name] ?? "—";
    return (value === "ok" ? "✓" : "✗ " + value).padEnd(24);
  });
  console.log(`${name.padEnd(width)}  ${cells.join("")}`);
}
console.log("");
const edOk = results.filter((r) => r.ops["Ed25519 generateKey"] === "ok").map((r) => r.label);
console.log(`Ed25519 умеют: ${edOk.length ? edOk.join(", ") : "никто"} — из ${results.length}`);
