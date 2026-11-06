// A chat keeps no history and a line it acked is not sent again, so a talk in the pane must outlive a switch to another
// talk (handoff 03.11, step 1). The app has no DOM test library: this reads the source; the living check is the crowd's talk block.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const app = read("./App.tsx"), chat = read("../screens/Chat.tsx");

test("talks in the pane: every opened talk stays mounted, keyed by its own row", () => {
  assert.doesNotMatch(app, /<Chat key=\{beside\.id\}/, "one Chat keyed by the selected talk unmounts the talk left, and its acked lines are gone");
  assert.match(app, /talks\.map\(\(r\) => <Chat key=\{r\.id\}[^>]*row=\{r\}/, "each opened talk has its own mounted Chat with its own row");
});

test("talks in the pane: a talk not selected is hidden, not unmounted, and its frame really hides", () => {
  assert.match(app, /hidden=\{!!besideMatch \|\| r\.id !== beside\?\.id\}/, "only the selected talk is shown");
  assert.match(chat, /style=\{hidden \? \{ display: "none" \} : undefined\}/, "inline: .ch.ch-pane sets display, so the hidden attribute alone would lose");
});

test("a match from the side pane of another screen opens the inbox, which draws it", () => {
  assert.match(app, /setBesideMatch\(row\); if \(screen\.at !== "inbox"\) tab\("chats"\); return;/, "from the feed the inbox is not mounted and the click did nothing");
});

test("archive §13: a talk beside the list only from the desktop; a tablet opens it over the whole area", () => {
  assert.doesNotMatch(app, /useWide\("--bp-tablet"\)/, "two panes on a tablet are not in the archive (tablet-kypros-day 108-inbox, 113-chat)");
  assert.match(app, /onOpenChat=\{wide \? /, "the talk opens beside the list only at wide");
});

test("a talk opened in the pane does not take another talk's stale sheet; a hidden one shuts its own", () => {
  assert.match(chat, /useState\(\(\) => frame === "screen" && sheetOf\(\)\)/, "a new talk in the pane read the entry of the talk's menu left open");
  assert.match(chat, /setMenu\(!hidden && sheetOf\(\)\)/, "a hidden talk reacted to the shown talk's sheet");
  assert.match(chat, /if \(hidden && menu\) closeMenu\(\)/, "the menu stayed open under a talk hidden");
});

test("back on the inbox the shown talk is kept, so the next click does not unmount it", () => {
  assert.match(app, /setOpenTalks\(beside && seated \? \[beside\] : \[\]\)/, "leaving the inbox dropped the set while beside stayed");
});

test("a hidden talk that ended leaves the set, and closing it does not close the talk on show", () => {
  assert.match(chat, /if \(hidden && frame === "pane" && view\.over\) onBack\(\)/, "an ended talk stayed mounted hidden");
  assert.match(app, /setBeside\(\(b\) => \(b\?\.id === id \? null : b\)\)/, "a hidden talk ending closed the one on show");
});

test("the seat going drops the pane: the next person in this tab does not open the last one's talk", () => {
  for (const name of ["function gone()", "const closed = ()"]) {
    const from = app.indexOf(name);
    assert.ok(from > 0, name);
    assert.match(app.slice(from, app.indexOf("setSeated(null)", from)), /dropPane\(\);/, `${name} leaves beside and besideMatch set`);
  }
  assert.match(app, /dropPane = \(\) => \{ setBeside\(null\); setBesideMatch\(null\); setOpenTalks\(\[\]\); \}/);
});
