// Mint a publishable API key for a brand.
//
//   deno run --allow-env --allow-read --allow-write --allow-net \
//     tools/create_publishable_key.ts <brand> [origin ...]
//
// Publishable, so it is printed in full and stored in full — there is nothing to
// hide (see lib/api_key.ts). List the origins the landing is served from; an
// empty list accepts any origin, which is only right for a local stand.

import { config } from "../src/config.ts";
import { createPublishableKey, keysDir } from "../src/lib/api_key.ts";
import { storageEnabled } from "../src/lib/storage.ts";
import { brandByKey } from "../src/lib/brand_registry.ts";

const [brand, ...origins] = Deno.args;

if (!brand) {
  console.error("usage: create_publishable_key.ts <brand> [origin ...]");
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
const key = await createPublishableKey(brand, origins);

// The id on stdout so `key=$(…)` works; everything else on stderr.
console.log(key.id);
console.error(
  `\nwrote ${keysDir()}/${key.id}.json\n` +
    `  brand:   ${key.brand}\n` +
    `  origins: ${origins.length ? origins.join(", ") : "(any — local stand only)"}\n` +
    `\nPut it in the landing's config.js as publishableKey.`,
);
