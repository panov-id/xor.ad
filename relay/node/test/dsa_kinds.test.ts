// The kinds of target a notice may name live in three places: the enum in the DSA
// specification, the set the route accepts, and the CHECK the database holds. The
// table and screen 19 were added on 2026-08-26; the specification got the notice
// target on 2026-08-28 (191eb9e), and it reached this code on 2026-08-30. For two
// days a line at a table — public, unencrypted, moderated like the feed — was
// answered with 422 by the only mechanism Article 16 requires us to run, and
// nothing anywhere went red.
//
// Then the same gap opened one layer down and stayed open five days longer: the
// route accepted the kind, and `CHECK (target_kind IN ...)` in db/005 did not
// list it, so the INSERT was refused and the reporter got 503 where Article
// 16(4) requires a receipt. Found on 2026-08-31 by a review panel, measured
// against a migrated database, closed by db/012. Two places agreeing while the
// third disagrees is the whole failure mode here, so the test now holds three.
//
// The registry of retired wordings cannot catch this: nothing was retired, a
// value was added. The pairing check cannot: both language versions of the
// specification agreed with each other and disagreed with the code. Only the
// document held against the code catches it, which is what this does.
//
// The specification is the source. If a kind is added there, this test fails
// until the route accepts it — and if one is dropped there, it fails until the
// route stops accepting it, because a mechanism that quietly takes a target the
// documents no longer describe is the same defect facing the other way.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { KINDS } from "../src/routes/report.ts";
import { suite } from "./support/config_env.ts";

const configured = suite({});

const spec = Deno.readTextFileSync(
  new URL("../../../docs/dsa/SPEC_EN.md", import.meta.url),
);

// | `target_kind` | enum | `feed_message` \| `offer` \| `table_line` \| … |
// The pipes inside the cell are escaped, so the cell cannot be found by looking
// for the next unescaped one — the first attempt at this test read a single kind
// and went red on a document that was correct.
function kindsFromSpec(): string[] {
  const row = spec.match(/^\|\s*`target_kind`\s*\|\s*enum\s*\|(.+)$/m);
  assert(row, "the specification no longer states the target_kind enum");
  return [...row![1].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]).sort();
}

configured("the route accepts exactly the kinds the specification names", () => {
  assertEquals([...KINDS].sort(), kindsFromSpec());
});

// What the database will actually hold, read the way a database reads it: files
// in order, the last definition winning. A migration that widens the constraint
// is a new file — tools/migrate_db.ts skips a name already in schema_migrations,
// so editing an applied file changes nothing anywhere it matters.
function kindsFromMigrations(): string[] {
  const directory = new URL("../db/", import.meta.url);
  const names = [...Deno.readDirSync(directory)]
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let last: string[] | null = null;
  for (const name of names) {
    const sql = Deno.readTextFileSync(new URL(name, directory));
    for (const match of sql.matchAll(/target_kind\s+IN\s*\(([^)]*)\)/g)) {
      last = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    }
  }
  assert(last, "no migration defines the target_kind CHECK any more");
  return last!;
}

configured("the database allows exactly the kinds the route accepts", () => {
  assertEquals(kindsFromMigrations(), [...KINDS].sort());
});

configured("the enum in the specification is not empty and names a table line", () => {
  const kinds = kindsFromSpec();
  assert(kinds.length >= 4, `the enum shrank to ${kinds.length} kinds — read the diff`);
  assert(
    kinds.includes("table_line"),
    "a line at a table lost its notice target; screen 19 still promises one",
  );
});
