// docs/newdesign4 on the laptop (owner /go 31.10.2026, the shell at 1440 by the archive): the tab bar draws the archive's
// nav (nd4/nav-laptop.gen.tsx, made by scripts/design/nd4-extract.py) and none of its own markup there; the rail's place in
// tokens/wide.css takes the archive's sizes from tokens/nd4-kit.css.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("nav-laptop: from the desktop width the tab bar draws the generated nav", () => {
  const bar = read("./TabBar.tsx");
  const desk = bar.slice(bar.indexOf("if (desk)"), bar.indexOf("return (", bar.indexOf("if (desk)") + 10) + 400);
  assert.match(bar, /const desk = useMinWidth\("--bp-desktop"\);/, "the tab bar asks the desktop breakpoint");
  assert.match(desk, /<NavLaptop\b/, "on the desktop the tab bar renders NavLaptop");
  assert.doesNotMatch(desk, /className="[^"]*\bk-nav\b/, "the nav's wrapper has no k-nav (tokens/kit.css .k-nav > * sizes its child as a phone tab)");
  assert.doesNotMatch(desk.slice(0, desk.indexOf("<NavLaptop")), /<(button|span|NdIcon)\b/, "no hand markup before the generated nav");
  const gen = read("../nd4/nav-laptop.gen.tsx");
  assert.match(gen.split("\n")[0], /^\/\/ generated from docs\/newdesign4\/.*kypros-laptop\.html/, "the nav is generated from the archive");
  for (const id of ["tab-feed", "tab-tables", "tab-chats", "tab-me", "rail-say"]) assert.ok(gen.includes(`"${id}"`), `the nav keeps data-testid ${id}`);
  const kit = read("../../tokens/nd4-kit.css");
  // the numbers themselves are checked against the archive by scripts/design/nd4-extract.test.py
  assert.match(kit, /:root:root \{ --rail-w: \d+\w+; --nd-gap: \d+\w+; \}/, "the rail's place takes the nav width and gap from nd4-kit.css");
});

// Below the laptop the bar is the archive's (screen 283), generated: the hand tabs must not come back next to it.
test("the phone's bar is the archive's, with all four tabs", () => {
  const bar = read("./TabBar.tsx");
  assert.match(bar, /<NavPhone /, "TabBar.tsx: the phone does not draw the generated bar");
  assert.doesNotMatch(bar, /className="tabbar k-nav"/, "TabBar.tsx: the hand-made bar is back");
  const gen = read("../nd4/nav-phone.gen.tsx");
  for (const id of ["tab-feed", "tab-tables", "tab-chats", "tab-me"]) assert.ok(gen.includes(`"${id}"`), `nav-phone.gen.tsx: no ${id}`);
});
