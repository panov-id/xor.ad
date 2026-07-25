// Local-dev helper: print a signed panel session JWT so /admin/* routes can be
// exercised without going through the magic-link email flow.
//
//   deno run --allow-env tools/mint_panel_token.ts <role> [email] [ttlSeconds]
//
// Signs with SESSION_SECRET from the environment — the same secret the node runs
// with, so a token minted here is only valid against that stand.

import { sign } from "../src/lib/jwt.ts";

const [role = "admin", email = `${role}@local`, ttl = "3600"] = Deno.args;
const secret = Deno.env.get("SESSION_SECRET");

if (!secret) {
  console.error("SESSION_SECRET is not set — nothing to sign with.");
  Deno.exit(1);
}

console.log(
  await sign(
    { sub: email, role, exp: Math.floor(Date.now() / 1000) + Number(ttl) },
    secret,
  ),
);
