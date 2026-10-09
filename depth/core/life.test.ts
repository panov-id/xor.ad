// lifeOf: the bar, the «скоро» border and the minutes of a phrase in a match —
// the same numbers for the web's inbox and the terminal's (WP-2).
import { assertEquals } from "jsr:@std/assert@1";
import { lifeOf, PHRASE_LIFE_SECONDS } from "./life.ts";

const now = 1_800_000_000;

Deno.test("no end, no life: the phrase has left the feed", () => {
  assertEquals(lifeOf(undefined, now), null);
  assertEquals(lifeOf(Number.NaN, now), null);
});

Deno.test("a fresh phrase is a full bar, not soon, its minutes whole", () => {
  assertEquals(lifeOf(now + PHRASE_LIFE_SECONDS, now), { left: 1, soon: false, minutes: 260 });
});

Deno.test("«скоро» starts at the last fifth and not a second before", () => {
  const fifth = PHRASE_LIFE_SECONDS / 5;
  assertEquals(lifeOf(now + fifth + 1, now)?.soon, false);
  assertEquals(lifeOf(now + fifth, now)?.soon, true);
});

Deno.test("minutes round up: 61 seconds ahead are two minutes, one second is one", () => {
  assertEquals(lifeOf(now + 61, now)?.minutes, 2);
  assertEquals(lifeOf(now + 1, now)?.minutes, 1);
});

Deno.test("an end already passed is an empty bar, soon, zero minutes — never negative", () => {
  assertEquals(lifeOf(now - 500, now), { left: 0, soon: true, minutes: 0 });
});
