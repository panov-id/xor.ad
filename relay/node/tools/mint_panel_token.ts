// Local-dev helper: print a signed panel session JWT so /admin/* routes can be
// exercised without going through the magic-link email flow.
//
//   deno run --allow-env tools/mint_panel_token.ts <role> [email] [ttlSeconds] [brand]
//
// Signs with SESSION_SECRET from the environment — the same secret the node runs
// with, so a token minted here is only valid against that stand. It also names
// the environment, and authed() refuses a token from another, so NODE_ENV_NAME
// has to match the stand as well: minting against a dev secret no longer
// produces something a prod node would accept, which is the whole point.

import { sign } from "../src/lib/jwt.ts";
import { config } from "../src/config.ts";

// A fourth argument mints a tenant's operator; without it the token is a
// platform one, which is what every existing caller of this tool expects.
const [role = "admin", email = `${role}@local`, ttl = "3600", brand = ""] = Deno.args;
const secret = Deno.env.get("SESSION_SECRET");

if (!secret) {
  console.error("SESSION_SECRET is not set — nothing to sign with.");
  Deno.exit(1);
}

console.log(
  await sign(
    {
      sub: email,
      role,
      brand: brand || null,
      env: config.envName,
      exp: Math.floor(Date.now() / 1000) + Number(ttl),
    },
    secret,
  ),
);
