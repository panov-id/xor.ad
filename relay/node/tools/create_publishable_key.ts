// Mint a publishable API key for a brand.
//
//   deno run --allow-env --allow-read --allow-write --allow-net \
//     tools/create_publishable_key.ts <brand> [origin ...]
//     tools/create_publishable_key.ts --native <brand>
//
// Publishable, so it is printed in full and stored in full — there is nothing to
// hide (see lib/api_key.ts). List the origins the landing is served from; an
// empty list accepts any origin, which is only right for a local stand.

import { config } from "../src/config.ts";
import { createPublishableKey, keysDir } from "../src/lib/api_key.ts";
import { storageEnabled } from "../src/lib/storage.ts";
import { brandByKey } from "../src/lib/brand_registry.ts";

// A native client — a terminal, an app — has no page and therefore no Origin, so
// its key carries no allowlist and no per-key daily limit (db/008). Asking for
// both is a contradiction and is refused rather than half-honoured.
const args = [...Deno.args];
const nativeAt = args.indexOf("--native");
const native = nativeAt >= 0;
if (native) args.splice(nativeAt, 1);
const [brand, ...origins] = args;

if (!brand) {
  console.error("usage: create_publishable_key.ts [--native] <brand> [origin ...]");
  Deno.exit(1);
}
if (native && origins.length > 0) {
  console.error("a native key has no Origin to allow — drop the origins");
  Deno.exit(1);
}
if (!storageEnabled()) {
  console.error("storage is not configured — nowhere to write the key");
  Deno.exit(1);
}
if (!await brandByKey(brand)) {
  // A key for a brand nobody serves would resolve to 503 on every request.
  console.error(`unknown brand "${brand}" — known: ${config.brands.map((b) => b.key).join(", ")}`);
  Deno.exit(1);
}

// The same function the panel calls — a key issued two ways would eventually
// be issued two shapes.
const key = await createPublishableKey(brand, origins, native ? "native" : "browser");

// The id on stdout so `key=$(…)` works; everything else on stderr.
console.log(key.id);
// "(any)" would be the wrong word for a native key: there is no Origin to allow
// or to refuse, which is a different statement from "we allow all of them".
const originLine = native
  ? "(none — a native client sends no Origin)"
  : origins.length
  ? origins.join(", ")
  : "(any — local stand only)";
console.error(
  `\nwrote ${keysDir()}/${key.id}.json\n` +
    `  brand:   ${key.brand}\n` +
    `  client:  ${native ? "native" : "browser"}\n` +
    `  origins: ${originLine}\n` +
    (native
      ? `\nBake it into the client's image. It is shared by every copy, so it is\n` +
        `not metered per key — the limits that apply are per address.`
      : `\nPut it in the landing's config.js as publishableKey.`),
);
