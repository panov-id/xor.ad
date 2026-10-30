// sosed's look (owner 2026-10-30, docs/newdesign4 README_design §1–2): four stone themes × day/night, «when» by the sun,
// eight gem accents; old ids read as new ones; app/tokens/nd4-themes.gen.css carries every theme, time and accent
// the code names, and every --c-* the shell still uses has an alias.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import {
  ACCENT_KEY, ACCENTS, applyTheme, OLD_IDS, readAccent, readChoice, readWhen, resolveTime, saveChoice,
  STORAGE_KEY, sunHours, THEMES, WHEN_KEY, WHENS,
} from "./theme.ts";

const store = (v: Record<string, string>) => ({ getItem: (k: string) => v[k] ?? null });
const nd4 = readFileSync(new URL("../../../tokens/nd4-themes.gen.css", import.meta.url), "utf8");

test("an id an older build kept reads as a new theme (every OLD_IDS key) and is written back once", () => {
  for (const [old, now] of Object.entries(OLD_IDS)) {
    assert.ok(THEMES.includes(now), `OLD_IDS ${old} -> ${now} is no theme`);
    assert.equal(readChoice(store({ [STORAGE_KEY]: old })), now, `a kept «${old}» did not become ${now}`);
  }
  for (const id of ["sea", "plum", "white", "black", "colour", "classic", "light", "dark", "auto", "dusk"]) assert.ok(Object.hasOwn(OLD_IDS, id), `old id ${id} has no new one`);
  for (const id of THEMES) assert.equal(readChoice(store({ [STORAGE_KEY]: id })), id);
  assert.equal(readChoice(store({ [STORAGE_KEY]: "neon" })), "limestone");
  assert.equal(readChoice(store({})), "limestone", "the default is not limestone");
  assert.equal(readChoice({ getItem: () => { throw new Error("blocked"); } }), "limestone");
  const kept = new Map([[STORAGE_KEY, "plum"]]);
  const s = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  const doc = { documentElement: { dataset: {} as Record<string, string> } } as unknown as Document;
  assert.equal(applyTheme(doc, s as unknown as Storage, { lat: 34.7, lon: 33 }, new Date("2026-10-30T10:00:00Z")), "amber");
  assert.equal(kept.get(STORAGE_KEY), "amber", "the old id was not written back as the new one");
  assert.deepEqual({ ...doc.documentElement.dataset }, { theme: "amber", time: "day", accent: "carnelian" });
});

test("«when»: the sun in Limassol turns night after sunset and day after sunrise; day and night stay", () => {
  const at = { lat: 34.7, lon: 33.0 };
  const s = sunHours(at.lat, at.lon, new Date("2026-10-30T12:00:00Z"));
  // the NOAA formula gives 04:06 and 14:57 UTC (06:06 and 16:57 at UTC+2); not checked against an almanac
  assert.ok(s && s.rise > 3.9 && s.rise < 4.3 && s.set > 14.8 && s.set < 15.1, `Limassol 30.10 sun ${JSON.stringify(s)}`);
  assert.equal(resolveTime("sun", at, new Date("2026-10-30T10:00:00Z")), "day");
  assert.equal(resolveTime("sun", at, new Date("2026-10-30T20:00:00Z")), "night");
  assert.equal(resolveTime("sun", at, new Date("2026-10-30T02:00:00Z")), "night");
  assert.equal(resolveTime("day", at, new Date("2026-10-30T23:00:00Z")), "day");
  assert.equal(resolveTime("night", at, new Date("2026-10-30T12:00:00Z")), "night");
  assert.equal(resolveTime("sun", { lat: 78, lon: 15 }, new Date("2026-06-21T00:00:00Z")), "day", "polar summer");
  assert.equal(resolveTime("sun", { lat: 78, lon: 15 }, new Date("2026-12-21T12:00:00Z")), "night", "polar winter");
  assert.equal(readWhen(store({})), "sun");
  for (const w of WHENS) assert.equal(readWhen(store({ [WHEN_KEY]: w })), w);
  assert.equal(readWhen(store({ [WHEN_KEY]: "toString" })), "sun");
});

test("accent: default carnelian, each of the 8 read back, a stray value falls back", () => {
  assert.equal(readAccent(store({})), "carnelian");
  for (const a of ACCENTS) assert.equal(readAccent(store({ [ACCENT_KEY]: a })), a);
  assert.equal(readAccent(store({ [ACCENT_KEY]: "__proto__" })), "carnelian");
});

test("saving the default forgets the key; saving another keeps it", () => {
  const kept = new Map<string, string>();
  const s = { setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  saveChoice("chalk", s);
  assert.equal(kept.get(STORAGE_KEY), "chalk");
  saveChoice("limestone", s);
  assert.equal(kept.has(STORAGE_KEY), false);
});

test("nd4-themes.gen.css has a block for every theme × time and every accent × time the code names (N of M)", () => {
  const missing: string[] = [];
  for (const t of THEMES) for (const time of ["day", "night"]) if (!nd4.includes(`:root[data-theme="${t}"][data-time="${time}"] {`)) missing.push(`${t} ${time}`);
  for (const a of ACCENTS) for (const time of ["day", "night"]) if (!nd4.includes(`:root[data-accent="${a}"][data-time="${time}"]`)) missing.push(`${a} ${time}`);
  const total = THEMES.length * 2 + ACCENTS.length * 2;
  assert.deepEqual(missing, [], `${total - missing.length} of ${total}; missing ${missing.join(", ")}`);
});

const lum = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("README_design §2: the text on every accent's button reads at >= 4.5, day and night (8 × 2 named)", () => {
  const low: string[] = [];
  for (const a of ACCENTS) for (const time of ["day", "night"]) {
    const m = new RegExp(`data-accent="${a}"\\]\\[data-time="${time}"\\] \\{ --accent: (#[0-9a-f]{6}); --on-accent: (#[0-9a-f]{6});`).exec(nd4);
    assert.ok(m, `${a} ${time} has no --accent / --on-accent`);
    const r = ratio(m[1], m[2]);
    if (r < 4.5) low.push(`${a} ${time} ${r.toFixed(2)}`);
  }
  assert.deepEqual(low, [], `${ACCENTS.length * 2 - low.length} of ${ACCENTS.length * 2} read; low: ${low.join(", ")}`);
});

test("every theme's --text reads on its --bg or its panel (contrast >= 4.5; 4 × 2)", () => {
  for (const t of THEMES) for (const time of ["day", "night"]) {
    const block = nd4.split(`[data-theme="${t}"][data-time="${time}"] {`)[1].split("}")[0];
    const text = /--text: (#[0-9a-f]{6});/.exec(block)?.[1] ?? "";
    const panel = /--panel-solid: (#[0-9a-f]{6})/.exec(block)?.[1];
    assert.match(text, /^#/, `${t} ${time} --text`);
    if (panel) assert.ok(ratio(text, panel) >= 4.5, `${t} ${time}: --text on the panel is ${ratio(text, panel).toFixed(2)}`);
  }
});

const css = readFileSync(new URL("../../../tokens/themes.css", import.meta.url), "utf8")
  + readFileSync(new URL("../../../tokens/legacy-bridge.css", import.meta.url), "utf8");

test("every --c-* colour the shell uses has an alias to the theme (N of M named)", () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
    const p = `${d}/${f}`;
    return statSync(p).isDirectory() ? walk(p) : /\.(css|tsx)$/.test(f) ? [p] : [];
  });
  const root = new URL("../../", import.meta.url).pathname;
  const used = new Set<string>();
  for (const f of [...walk(`${root}`), ...walk(`${root}../tokens`)]) {
    for (const m of readFileSync(f, "utf8").matchAll(/var\((--c-[a-z0-9-]+)/g)) used.add(m[1]);
  }
  const block = /:root\[data-theme\] \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const aliased = new Set([...block.matchAll(/(--c-[a-z0-9-]+):/g)].map((m) => m[1]));
  const own = new Set<string>();
  for (const f of [...walk(`${root}`), ...walk(`${root}../tokens`)]) {
    for (const m of readFileSync(f, "utf8").matchAll(/(--c-[a-z0-9-]+):\s*(?!var\(--(bg|panel|tile|accent|text|on-accent|theirs|acc-))/g)) own.add(m[1]);
  }
  const stray = [...used].filter((c) => !aliased.has(c) && !own.has(c));
  assert.deepEqual(stray, [], `--c-* in use that nothing defines: ${stray.join(", ")}`);
});

test("themes.css is still the prototype's tokens.css verbatim: the base the new themes are built on", () => {
  const proto = readFileSync(new URL("../../../../docs/newdesign/proto/tokens.css", import.meta.url), "utf8");
  const themes = readFileSync(new URL("../../../tokens/themes.css", import.meta.url), "utf8");
  assert.equal(themes, proto, "app/tokens/themes.css drifted from docs/newdesign/proto/tokens.css");
});
