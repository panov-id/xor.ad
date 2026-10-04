// The inbox is read to its end (T15): the node answers in pages of a hundred
// (routes/inbox.ts PAGE), and a client that stopped at the first lost every
// row past the hundredth. A hundred and five offers to talk are laid for one
// person straight in the stand's database — a match needs a second person per
// pair (matches.pair_key is unique), and registering a hundred and five over
// HTTP meets the node's own limits — and the inbox is then read through the
// core, signed, over HTTP.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";
import { newPaperCode } from "./paper.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

const MATCHES = 105;

Deno.test({
  name: "an inbox of more than a page comes whole, its events once",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const me = new Client(node!, apiKey!);
      await me.register({ name: "Женя", age: 30 }, { pin: "123456", paperCode: newPaperCode() });
      await me.confirmPaperCode();

      const laid: string[] = [];
      for (let i = 0; i < MATCHES; i++) {
        // The other side: a copy of my own row under a new id, with the one
        // unique column made its own.
        const [other] = await sql.unsafe<{ id: string }[]>(
          `INSERT INTO identities
             SELECT (jsonb_populate_record(NULL::identities, to_jsonb(i)
               || jsonb_build_object('id', gen_random_uuid(),
                                     'recovery_auth_hash', md5(random()::text) || md5(random()::text)))).*
               FROM identities i WHERE i.id = $1
           RETURNING id`,
          [me.identityId],
        );
        const [match] = await sql.unsafe<{ id: string }[]>(
          `INSERT INTO matches (id, pair_key, created_at, expires_at)
           VALUES (gen_random_uuid(), $1, now() - $2 * interval '1 second', now() + interval '3 hours')
           RETURNING id`,
          [crypto.randomUUID(), i],
        );
        await sql.unsafe(
          `INSERT INTO match_participants (match_id, identity, message_id, text_snapshot, mode)
           VALUES ($1, $2, gen_random_uuid(), 'моя фраза', 'alone'),
                  ($1, $3, gen_random_uuid(), 'фраза ' || $4, 'alone')`,
          [match.id, me.identityId, other.id, String(i)],
        );
        laid.push(match.id);
      }

      const { items, events, truncated } = await me.inboxSince(0);
      assertEquals(truncated, false, "the inbox says it was cut short: rows were left past the last page read");
      const got = new Set(items.filter((r) => r.kind === "match").map((r) => r.id as string));
      const lost = laid.filter((id) => !got.has(id));
      assertEquals(lost.length, 0, `${lost.length} of ${MATCHES} matches did not come: the inbox stopped at a page`);
      assertEquals(items.length, new Set(items.map((r) => r.id)).size, "a row came twice across pages");
      assert(events && typeof events === "object", "events did not come");

      // The count alone is one request (W14-IE): the inbox is two pages here,
      // and the events of the first are those of the whole walk.
      const real = globalThis.fetch;
      let asked = 0;
      globalThis.fetch = (input, init) => {
        if (new URL(input instanceof Request ? input.url : String(input)).pathname === "/inbox") asked++;
        return real(input, init);
      };
      let alone;
      try {
        alone = await me.inboxEvents(0);
      } finally {
        globalThis.fetch = real;
      }
      assertEquals(asked, 1, `the count of an inbox of ${MATCHES} rows took ${asked} requests`);
      assertEquals(alone, events, "the first page's events differ from the whole walk's");
    } finally {
      await sql.end();
    }
  },
});
