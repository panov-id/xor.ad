// Create the first platform administrator of an environment.
//
//   deno run --allow-env --allow-read --allow-write --allow-net \
//     tools/seed_admin.ts <email>
//
// A new environment has nobody in it, and every door into the panel needs
// somebody already inside: `/admin/panel-users` requires a session, a session
// comes from a magic link, and `requestMagicLink` returns silently for an
// address that is not a member — invite-only, on purpose, so that a login form
// never reveals who is one. That is a closed circle, and the way out of it used
// to be writing the object into storage by hand, which means nobody can bring up
// a working panel from the documentation alone.
//
// **It seeds only into an empty environment.** If any operator exists, this
// refuses and says so. That is what keeps it safe to ship inside the image: it
// is not a way to add an administrator, it is a way to have a first one. Adding
// the second is the panel's job, where it is authorised and audited.

import { config } from "../src/config.ts";
import { sha256hex } from "../src/lib/hash.ts";
import { list, put, storageEnabled } from "../src/lib/storage.ts";
import { usersDir } from "../src/lib/auth.ts";

const [raw] = Deno.args;
const email = raw?.trim().toLowerCase() ?? "";

// Deliberately not the strict validator the API uses: a wrong address here is a
// typo by whoever runs the wizard, and it fails visibly on the first sign-in
// attempt. What matters is that it looks like an address at all.
if (!email || !email.includes("@")) {
  console.error("usage: seed_admin.ts <email>");
  Deno.exit(1);
}

if (!storageEnabled()) {
  console.error("storage is not configured — nowhere to write the operator");
  Deno.exit(1);
}

const dir = usersDir();
const existing = await list(dir);
if (existing.length > 0) {
  console.error(
    `${config.envName}: ${existing.length} operator(s) already exist — ` +
      "seeding is only for an empty environment. Add operators from the panel.",
  );
  Deno.exit(2);
}

const user = {
  email,
  role: "admin",
  brand: null,
  created_at: new Date().toISOString(),
};

await put(`${dir}/${await sha256hex(email)}.json`, user);

// No audit entry: the trail records what an actor did, and there is no actor
// here — this runs before anyone can be one. The commit and the wizard's output
// are the record.
console.log(`${config.envName}: seeded platform administrator ${email}`);
console.log("sign in from the panel's login screen — the link goes to that address.");
