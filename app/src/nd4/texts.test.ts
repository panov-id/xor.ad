// Every archive text of a texts-mode screen has its Russian; the set is read from the generated .en.json files on disk,
// so a new family or a new text in the archive fails here until its Russian is written.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("./texts/", import.meta.url);

test("texts mode: each family's Russian covers its archive texts, nothing more", () => {
  const en = readdirSync(dir).filter((f) => f.endsWith(".en.json"));
  assert.ok(en.length >= 4, `read ${en.length} families`);
  for (const f of en) {
    const keys: string[] = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    const ru: Record<string, string> = JSON.parse(readFileSync(new URL(f.replace(".en.", ".ru."), dir), "utf8"));
    assert.deepEqual(keys.filter((k) => !(k in ru)), [], `${f}: no Russian for these`);
    assert.deepEqual(Object.keys(ru).filter((k) => !keys.includes(k)), [], `${f}: Russian for texts the archive no longer has`);
    assert.deepEqual(Object.entries(ru).filter(([, v]) => !v.trim()), [], `${f}: empty Russian`);
  }
  const src = readFileSync(new URL("./texts.ts", import.meta.url), "utf8");
  for (const f of en) assert.match(src, new RegExp(`"${f.replace(".en.json", "")}": \\[`), `${f}: not in texts.ts`);
});
