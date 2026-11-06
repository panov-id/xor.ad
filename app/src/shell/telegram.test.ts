// In Telegram only 18+ (owner 05.11.2026). Registration and the entry are driven live by scripts/flow/telegram-shell.mjs;
// the age's edit is read from the source here, as the app has no DOM test library.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const edit = readFileSync(new URL("../screens/me/EditAge.tsx", import.meta.url), "utf8");

test("the age's edit in Telegram: under 18 cannot be saved and says why", () => {
  assert.match(edit, /const youngHere = youngInTelegram\(age\)/, "EditAge does not ask about Telegram");
  assert.match(edit, /const changed = [^;]*&& !youngHere;/, "under 18 can be saved in Telegram");
  assert.match(edit, /<ErrorLine text=\{youngHere \? say\("app\.telegram\.young"\)/, "the refusal says nothing");
});
