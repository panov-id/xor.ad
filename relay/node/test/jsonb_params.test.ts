// No `$n::jsonb` in the node's SQL. Run: deno test (in node/). The data-side
// check, which also sees an uncast parameter, is tools/check_jsonb_strings.ts.
//
// postgres.js encodes a string handed to `$n::jsonb` as JSON a second time, and
// the row holds a JSON string instead of the value. Three writers did it before
// the rule was written down in lib/jobs.ts (/v1's idempotency 07-29, the notice
// snapshot 08-05, the job payload — found 23.09) and one after (the step away,
// 23.09), so the rule is a test: every jsonb parameter goes through text —
// `$n::text::jsonb`.
import { assertEquals } from "jsr:@std/assert@1";

const SOURCE = new URL("../src/", import.meta.url);

async function* files(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* files(url);
    else if (entry.name.endsWith(".ts")) yield url;
  }
}

Deno.test("every jsonb parameter in the node goes through text", async () => {
  const offenders: string[] = [];
  for await (const url of files(SOURCE)) {
    const lines = (await Deno.readTextFile(url)).split("\n");
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith("//")) return;
      if (/\$\d+::jsonb/.test(line)) offenders.push(`${url.pathname.split("/src/")[1]}:${i + 1}`);
    });
  }
  assertEquals(offenders, [], `a string handed to $n::jsonb is stored as a JSON string; use $n::text::jsonb`);
});
