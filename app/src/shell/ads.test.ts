// The ad screens 261..272 sit behind one flag (owner 02.11.2026): off unless the build says "1", nothing given to a slot with it off,
// and every call site of the app asks the one reader. The generated pieces' own guard (a slot only behind p.ad) is tested in
// scripts/design/nd4-extract.test.py; the set of slots is read from the code here, not listed.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { AD_SLOTS, adSpec, adsOn, NATIVE_AT, withAd, type AdSlotKey } from "./ads-logic.ts";

const SRC = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, SRC), "utf8");
const files = (dir: string): string[] => readdirSync(new URL(dir, SRC)).flatMap((f) => {
  const rel = `${dir}${f}`;
  return statSync(new URL(rel, SRC)).isDirectory() ? files(`${rel}/`) : [rel];
});
const sources = files("").filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));

test("ads: off unless the flag is exactly 1", () => {
  assert.equal(adsOn("1"), true);
  for (const v of [undefined, null, "", "0", "true", "yes", " 1", 1, true]) assert.equal(adsOn(v), false, `${String(v)} turned ads on`);
});

test("ads: with the flag off no slot gets a spec, with it on each gets its archive words (N of M)", () => {
  const keys = Object.keys(AD_SLOTS) as AdSlotKey[];
  assert.equal(keys.length, 5);
  for (const k of keys) {
    assert.equal(adSpec(k, "Ad slot", false), undefined, `${k} has a spec with the flag off`);
    const on = adSpec(k, "Ad slot", true);
    assert.deepEqual(on, { id: AD_SLOTS[k].place, title: "Ad slot", place: AD_SLOTS[k].place, size: AD_SLOTS[k].size, height: AD_SLOTS[k].height });
  }
});

test("ads: the sponsored tile is a hole in the rows only with the flag on and enough rows", () => {
  const rows = ["a", "b", "c"];
  assert.deepEqual(withAd(rows, false), rows);
  assert.deepEqual(withAd(rows, true), ["a", "b", null, "c"]);
  assert.equal(withAd(rows, true).indexOf(null), NATIVE_AT);
  assert.deepEqual(withAd(["a"], true), ["a"], "one phrase: no tile among so few");
  assert.deepEqual(withAd([], true), []);
});

test("ads: the flag is read in one file; every slot is used by the app and every use is a slot of the set", () => {
  const readers = sources.filter((f) => read(f).includes("VITE_ADS"));
  assert.deepEqual(readers, ["shell/ads.ts"], "VITE_ADS is read outside shell/ads.ts");
  assert.match(read("shell/ads.ts"), /export const ADS_ON = adsOn\(import\.meta\.env\.VITE_ADS\);/);
  const used = sources.filter((f) => f !== "shell/ads.ts").flatMap((f) => [...read(f).matchAll(/adFor\("([^"]+)"\)/g)].map((m) => m[1]));
  assert.deepEqual([...new Set(used)].sort(), Object.keys(AD_SLOTS).sort(), "a slot is not wired, or a call names a slot that is not in the set");
  assert.equal(used.length, Object.keys(AD_SLOTS).length + 0, "a slot is wired twice");
});

test("ads: each wired screen hands its slot to the generated piece, the feed tile goes by the flag", () => {
  assert.match(read("screens/Feed.tsx"), /<FeedQuiet [\s\S]*?ad=\{adFor\("quiet-feed"\)\} \/>/);
  assert.match(read("screens/Feed.tsx"), /withAd\(rows, ADS_ON\)\.map\(/);
  assert.match(read("screens/talks/Likes.tsx"), /<MyMarksEmpty [^\n]*ad=\{adFor\("nothing-liked"\)\} \/>/);
  assert.match(read("screens/talks/Likes.tsx"), /<AdSlot ad=\{adFor\("under-liked"\)\} \/>/);
  assert.match(read("screens/Chat.tsx"), /<Ended [^\n]*ad=\{adFor\("talk-ended"\)\} \/>/);
  assert.match(read("screens/MyPhrase.tsx"), /<Screen [\s\S]*?ad=\{adFor\("phrase-faded"\)\} \/>/);
});
