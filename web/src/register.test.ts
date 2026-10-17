// The registration rules both faces share (depth/core/register.ts), read by the web's own tests:
// the web's Register, CodeField and PinField call them, so a break here is a break on screen 02.
import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptedKey, inLegalOrder, keepAcceptedIn, readAcceptedIn } from "../../depth/core/legal.ts";
import {
  ageDigits, groupsMatch, isYoung, layOutGroups, lettersLeft, pinDigits, pinsDiffer, refusalOf, whyGroups, whyNext, whyPin,
} from "../../depth/core/register.ts";

const ok = { name: "Alex", age: "32", consent: true };

test("whyNext: the first thing missing is said first, in the order name, age, young, consent", () => {
  assert.equal(whyNext({ name: "", age: "", consent: false }), "name");
  assert.equal(whyNext({ name: "   ", age: "32", consent: true }), "name");
  assert.equal(whyNext({ name: "a".repeat(25), age: "32", consent: true }), "name");
  assert.equal(whyNext({ ...ok, age: "" }), "age");
  assert.equal(whyNext({ ...ok, age: "12" }), "young");
  assert.equal(whyNext({ ...ok, consent: false }), "consent");
  assert.equal(whyNext({ ...ok, age: "13" }), null);
  assert.equal(whyNext(ok), null);
});
test("whyNext: a name counts graphemes as the node does (24 emoji pass, 25 do not)", () => {
  assert.equal(whyNext({ ...ok, name: "👩‍👩‍👧".repeat(24) }), null);
  assert.equal(whyNext({ ...ok, name: "👩‍👩‍👧".repeat(25) }), "name");
  assert.equal(lettersLeft("Alex"), 20);
  assert.equal(lettersLeft("x".repeat(40)), 0);
});
test("age: digits only, three at most; under 13 is young, empty is not", () => {
  assert.equal(ageDigits("3a2 1x9"), "321");
  assert.equal(isYoung("12"), true);
  assert.equal(isYoung("13"), false);
  assert.equal(isYoung(""), false);
});
test("PIN pair: match opens; full and different says so; anything less is the general line", () => {
  assert.equal(whyPin("123456", "123456"), null);
  assert.equal(whyPin("123456", "123457"), "pin_differ");
  assert.equal(whyPin("123456", "12345"), "pin");
  assert.equal(whyPin("", ""), "pin");
  assert.equal(whyPin("12345", "12345"), "pin");
  assert.equal(pinsDiffer("123456", "654321"), true);
  assert.equal(pinsDiffer("123456", "123456"), false);
  assert.equal(pinDigits("12 34-56789"), "123456");
});
test("paper code typed back: both groups needed, read as the core reads a code", () => {
  const groups = ["K7QM", "2XWD", "PL4R", "9FTE"];
  assert.equal(whyGroups("", "9FTE"), "groups");
  assert.equal(whyGroups("2XWD", "9FTE"), null);
  assert.equal(groupsMatch(groups, "2xwd", "9-fte"), true);
  assert.equal(groupsMatch(groups, "2XWD", "9FTX"), false);
  assert.equal(groupsMatch(["A", "B1B1", "C", "D0D0"], "bIbL", "dOdo"), true); // I, L read as 1; O as 0
});
test("layOutGroups: a fourth character moves on, a whole code is split by place, a short paste fills on", () => {
  assert.deepEqual(layOutGroups(["", ""], 0, "2xwd", [2, 4]), { next: ["2XWD", ""], focus: 1 });
  assert.deepEqual(layOutGroups(["", ""], 1, "9ft", [2, 4]), { next: ["", "9FT"], focus: null });
  assert.deepEqual(layOutGroups(["", ""], 1, "9FTE", [2, 4]), { next: ["", "9FTE"], focus: null }); // the last group: nowhere to move on
  assert.deepEqual(layOutGroups(["", ""], 0, "K7QM-2XWD-PL4R-9FTE", [2, 4]), { next: ["2XWD", "9FTE"], focus: 1 });
  assert.deepEqual(layOutGroups(["", ""], 0, "2XWD9F", [2, 4]), { next: ["2XWD", "9F"], focus: 1 });
});
test("refusalOf: 429 is the limit, another status says its number, nothing heard is failed", () => {
  assert.deepEqual(refusalOf(new Error('registration refused: 429 {"error":"x"}')), { kind: "limit" });
  assert.deepEqual(refusalOf(new Error("registration refused: 503 down")), { kind: "refused", status: "503" });
  assert.deepEqual(refusalOf(new TypeError("Failed to fetch")), { kind: "failed" });
  assert.deepEqual(refusalOf("nothing"), { kind: "failed" });
});
test("legal: the documents come in the order terms, privacy, guidelines; accepted is kept under one key", () => {
  const r = (document: "terms" | "privacy" | "guidelines") => ({ document, revision_date: "2026-01-01", revision_sha256: document });
  assert.deepEqual(inLegalOrder([r("guidelines"), r("terms"), r("privacy")]).map((x) => x.document), ["terms", "privacy", "guidelines"]);
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  const key = acceptedKey("sosed", "id-1");
  assert.equal(key, "xor-legal:sosed:id-1");
  assert.deepEqual(readAcceptedIn(store, key), {});
  keepAcceptedIn(store, key, { terms: "abc" });
  assert.deepEqual(readAcceptedIn(store, key), { terms: "abc" });
  assert.deepEqual(readAcceptedIn(null, key), {});
});
