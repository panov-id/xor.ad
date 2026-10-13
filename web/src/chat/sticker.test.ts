import { strict as assert } from "node:assert";
import { test } from "node:test";
import { STICKER_IDS, STICKER_MARK, stickerOf, stickerText } from "./sticker.ts";
import { STICKER_ART } from "../ui/stickerArt.ts";

test("a sticker goes as the mark and its id, and comes back as the id", () => {
  assert.equal(stickerText("hi"), "\uE000sticker:hi");
  assert.equal(stickerOf(stickerText("giveup")), "giveup");
});

test("text stays text: a plain line, an unknown id, the bare word without the mark", () => {
  assert.equal(stickerOf("hi"), null);
  assert.equal(stickerOf("sticker:hi"), null);
  assert.equal(stickerOf(`${STICKER_MARK}bomb`), null, "an id outside the set is text, not a picture");
  assert.equal(stickerOf(`${STICKER_MARK}hi and more`), null);
  assert.throws(() => stickerText("bomb"));
});

test("the core's set is the sheets' set, in the same order (the drawn art is generated from the sheets)", () => {
  assert.deepEqual([...STICKER_IDS], STICKER_ART.map((s) => s.id));
});
