// The copy a notice is examined against is taken with a hand-written column
// list, and nothing checks it against the schema those columns belong to.
//
// That is worse than an ordinary typo, because of how the failure lands. The
// surfaces are not built yet, so today the capture stops at "no such table" and
// nobody notices. On the day they are built the SELECT starts failing instead —
// and a failed query is indistinguishable from an empty database inside
// `query()`, so the notice would be filed as "no copy was needed" and examined
// against nothing, silently. That is the same class of defect migration 006 was
// written to end.
//
// So the specs are the check: the columns must exist in the tables the specs
// define. This test reads them the way the panel's access test reads App.tsx —
// the document is the source, not a second copy of it.

import { assert } from "jsr:@std/assert@1";
import { SNAPSHOTTABLE } from "../src/lib/dsa_snapshot.ts";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

const read = (path: string) => Deno.readTextFileSync(new URL(path, import.meta.url));

// `CREATE TABLE feed_messages ( id uuid ..., text text ..., )` → the leading
// identifier of every line inside the block.
function columnsOfCreateTable(sql: string, table: string): Set<string> {
  const block = sql.match(new RegExp(`CREATE TABLE ${table} \\(([^;]*?)\\n\\);`, "s"));
  assert(block, `no CREATE TABLE ${table} in the spec`);
  const names = new Set<string>();
  for (const line of block[1].split("\n")) {
    const found = line.match(/^\s{2}([a-z_]+)\s+\S/);
    if (found) names.add(found[1]);
  }
  return names;
}

// The offers spec lists fields as an indented block rather than as SQL.
function fieldsOfBlock(text: string, heading: string): Set<string> {
  const start = text.indexOf(heading);
  assert(start >= 0, `no "${heading}" in the offers spec`);
  const names = new Set<string>();
  for (const line of text.slice(start).split("\n").slice(1)) {
    if (line.startsWith("## ") || line.startsWith("### ")) break;
    const found = line.match(/^\s{4}([a-z_]+)(\s|$)/);
    if (found) names.add(found[1]);
  }
  return names;
}

const listed = (kind: string) =>
  SNAPSHOTTABLE[kind].columns.split(",").map((column) => column.trim());

configured("every feed column copied into a snapshot exists in the feed's schema", () => {
  const schema = columnsOfCreateTable(read("../../../docs/chat_EN.md"), "feed_messages");
  for (const column of listed("feed_message")) {
    assert(
      schema.has(column),
      `dsa_snapshot copies feed_messages.${column}, which the chat spec does not define. ` +
        `The spec has: ${[...schema].join(", ")}`,
    );
  }
});

// Added 2026-08-31, the day the table got a schema. The kind was accepted by the
// route a day earlier with a column list written from the screen description —
// which is exactly the shape of guess this file exists to stop. Until the schema
// landed there was nothing to hold it against; now there is.
configured("every table-line column copied into a snapshot exists in the table's schema", () => {
  const schema = columnsOfCreateTable(read("../../../docs/chat_EN.md"), "table_lines");
  for (const column of listed("table_line")) {
    assert(
      schema.has(column),
      `dsa_snapshot copies table_lines.${column}, which the chat spec does not define. ` +
        `The spec has: ${[...schema].join(", ")}`,
    );
  }
});

configured("every offer column copied into a snapshot exists in the offer's fields", () => {
  const fields = fieldsOfBlock(read("../../../docs/offers/SPEC_EN.md"), "### offer\n");
  for (const column of listed("offer")) {
    assert(
      fields.has(column),
      `dsa_snapshot copies offers.${column}, which the offers spec does not define. ` +
        `The spec has: ${[...fields].join(", ")}`,
    );
  }
});

// The column the lookup is scoped by has to exist too, and for the same reason
// as the rest: it is named here by hand, and the table is not built yet, so a
// wrong name would surface as a failing query on the day the surface ships —
// which `query()` cannot tell from an empty database, so the notice would be
// filed as "no copy was needed" and examined against nothing.
//
// It matters more than the others. A snapshot taken without it is a snapshot
// taken across tenants.
configured("the column a snapshot is scoped by exists in both specs", () => {
  const feed = columnsOfCreateTable(read("../../../docs/chat_EN.md"), "feed_messages");
  assert(
    feed.has(SNAPSHOTTABLE.feed_message.tenant),
    `dsa_snapshot scopes feed_messages by ${SNAPSHOTTABLE.feed_message.tenant}, ` +
      `which the chat spec does not define. The spec has: ${[...feed].join(", ")}`,
  );

  const offer = fieldsOfBlock(read("../../../docs/offers/SPEC_EN.md"), "### offer\n");
  assert(
    offer.has(SNAPSHOTTABLE.offer.tenant),
    `dsa_snapshot scopes offers by ${SNAPSHOTTABLE.offer.tenant}, ` +
      `which the offers spec does not define. The spec has: ${[...offer].join(", ")}`,
  );
});

// Every surface must name one. A new entry added without it would compile —
// `tenant` would be undefined and the SQL would read `WHERE id = $1 AND
// undefined = $2` — and fail only against a real table.
configured("every snapshottable surface names a tenant column", () => {
  for (const [kind, surface] of Object.entries(SNAPSHOTTABLE)) {
    assert(
      typeof surface.tenant === "string" && surface.tenant.length > 0,
      `${kind} has no tenant column, so its snapshot would not be scoped to anyone`,
    );
  }
});

// The limits live in the code and the document, and only one of them is read by
// whoever builds a form against this API. They were in neither for months: six
// numbers that silently cut a notifier's reasoning in half.
configured("every length limit the code enforces is written down", () => {
  const spec = read("../../../docs/dsa/SPEC_EN.md");
  const report = Deno.readTextFileSync(new URL("../src/routes/report.ts", import.meta.url));
  const decide = Deno.readTextFileSync(new URL("../src/routes/dsa.ts", import.meta.url));

  const enforced: [string, number][] = [
    ["reason_text", Number(report.match(/REASON_MAX = (\d+)/)![1])],
    ["notifier_name", Number(report.match(/text\(body\.notifier_name, (\d+)\)/)![1])],
    ["source", Number(report.match(/text\(body\.source, (\d+)\)/)![1])],
    // Anchored on the call, not on the word: `.*?` across lines found a 422 in an
    // error response and reported the code as capping the field at 422.
    ["facts", Number(decide.match(/trimmed\(body\.facts, (\d+)\)/)![1])],
    ["ground_text", Number(decide.match(/trimmed\(body\.ground_text, (\d+)\)/)![1])],
  ];

  for (const [field, limit] of enforced) {
    const row = spec.split("\n").find((line) => line.includes(`\`${field}\``) && line.includes("|"));
    assert(row, `the spec does not mention ${field} in a table`);
    assert(
      new RegExp(String(limit)).test(spec.split("\n").filter((l) => l.includes(`\`${field}\``)).join(" ")),
      `the code caps ${field} at ${limit}, and the spec does not say so`,
    );
  }
});
