// The kinds of target a notice may name live in two places: the enum in the DSA
// specification and the set the route accepts. On 2026-08-26 `table_line` was
// added to the specification and to screen 19 of both storefronts; it reached
// this code on 2026-08-30. For four days a line at a table — public,
// unencrypted, moderated like the feed — was answered with 422 by the only
// mechanism Article 16 requires us to run, and nothing anywhere went red.
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

configured("the enum in the specification is not empty and names a table line", () => {
  const kinds = kindsFromSpec();
  assert(kinds.length >= 4, `the enum shrank to ${kinds.length} kinds — read the diff`);
  assert(
    kinds.includes("table_line"),
    "a line at a table lost its notice target; screen 19 still promises one",
  );
});
