// The starters of a conversation as the core reads them (chat spec "Liked, in
// order", §8.7; N3): the inbox row's starters[] checked and put in the order of
// their number, and a room frame extra_like turned into a starter with its
// mark. No node: what is under test is the reading, and the node's side has
// its own test (relay/node/test/inbox_starters.test.ts).
import { assertEquals } from "jsr:@std/assert@1";
import { extraLikeOf, startersOf } from "./client.ts";

Deno.test("the starters come in the order of their number, whatever order the row gives them in", () => {
  const got = startersOf({
    starters: [
      { position: 2, text: "кто на набережную?", mode: "alone", liked_by: "them", removed: false },
      { position: 1, text: "гуляю у залива", mode: "company", liked_by: "me", removed: false },
    ],
  });
  assertEquals(got.map((s) => s.position), [1, 2]);
  assertEquals(got.map((s) => s.liked_by), ["me", "them"]);
  assertEquals(got[0].text, "гуляю у залива");
});

Deno.test("a starter taken down keeps its number and says so; one without a number or a mark is dropped", () => {
  const got = startersOf({
    starters: [
      { position: 1, text: "", mode: "alone", liked_by: "me", removed: true },
      { position: "2", text: "a number as a string", mode: "alone", liked_by: "them" },
      { position: 3, text: "no mark", mode: "alone" },
      { position: 0, text: "no position zero", mode: "alone", liked_by: "me" },
      null,
    ],
  });
  assertEquals(got, [{ position: 1, text: "", mode: "alone", liked_by: "me", removed: true }]);
  assertEquals(startersOf({}), []);
  assertEquals(startersOf(null), []);
});

Deno.test("an extra like frame becomes a starter marked from this side; anything else is not one", () => {
  const theirs = extraLikeOf({ type: "extra_like", data: { position: 3, text: "и ещё", mode: "party", direction: "they_liked_yours" } });
  assertEquals(theirs, { position: 3, text: "и ещё", mode: "party", liked_by: "them", removed: false, direction: "they_liked_yours" });
  assertEquals(extraLikeOf({ type: "extra_like", data: { position: 4, text: "и моё", direction: "you_liked_theirs" } })?.liked_by, "me");
  assertEquals(extraLikeOf({ type: "extra_like", data: { position: 3, text: "x", direction: "sideways" } }), null);
  assertEquals(extraLikeOf({ type: "extra_like", data: { text: "no position", direction: "they_liked_yours" } }), null);
  assertEquals(extraLikeOf({ type: "message", data: { position: 3, text: "x", direction: "they_liked_yours" } }), null);
});
