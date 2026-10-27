// sosed's themes (owner 2026-10-26; NEWDESIGN_PLAN §3): old ids read as the new ones, colour and classic follow the device, the
// four blocks are the designer's, and every --c-* the shell still uses has an alias in themes.css.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { applyTheme, type Choice, OLD_IDS, readChoice, resolveTheme, saveChoice, STORAGE_KEY, THEMES } from "./theme.ts";

const store = (v: string | null) => ({ getItem: (k: string) => (k === STORAGE_KEY ? v : null) });

test("an id an older build kept reads as the new one (4 of 4) and is written back once", () => {
  assert.equal(readChoice(store("light")), "white", "a kept «light» did not become white");
  assert.equal(readChoice(store("dark")), "black", "a kept «dark» did not become black");
  assert.equal(readChoice(store("auto")), "colour", "a kept «auto» did not become colour");
  assert.equal(readChoice(store("dusk")), "plum", "the old shell's Dusk did not become plum");
  for (const id of [...THEMES, "classic"]) assert.equal(readChoice(store(id)), id, `a kept ${id} was not read back`);
  assert.equal(readChoice(store("neon")), "colour", "an unknown id did not fall back to colour");
  assert.equal(readChoice(store(null)), "colour", "the default is not colour");
  assert.equal(readChoice({ getItem: () => { throw new Error("blocked"); } }), "colour", "blocked storage broke the theme");
  assert.deepEqual(Object.keys(OLD_IDS).sort(), ["auto", "dark", "dusk", "light"]);
  const kept = new Map([[STORAGE_KEY, "dusk"]]);
  const s = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  const doc = { documentElement: { dataset: {} as Record<string, string> } } as unknown as Document;
  assert.equal(applyTheme(doc, s as unknown as Storage, false), "plum");
  assert.equal(kept.get(STORAGE_KEY), "plum", "the old id was not written back as the new one");
});

test("colour and classic follow the device's light or dark, never the clock; a picked theme does not turn (6 x 2)", () => {
  const want: Record<string, [string, string]> = { colour: ["sea", "plum"], classic: ["white", "black"], sea: ["sea", "sea"], plum: ["plum", "plum"], white: ["white", "white"], black: ["black", "black"] };
  for (const [c, [light, dark]] of Object.entries(want)) {
    assert.equal(resolveTheme(c as Choice, false), light, `${c} on a light device`);
    assert.equal(resolveTheme(c as Choice, true), dark, `${c} on a dark device`);
  }
  const src = readFileSync(new URL("./theme.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /getHours|new Date/, "the theme reads the clock again");
});

test("saving the default forgets the key; saving another choice keeps it", () => {
  const kept = new Map<string, string>();
  const s = { setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
  saveChoice("classic", s);
  assert.equal(kept.get(STORAGE_KEY), "classic");
  saveChoice("colour", s);
  assert.equal(kept.has(STORAGE_KEY), false);
});

const css = readFileSync(new URL("../../../tokens/themes.css", import.meta.url), "utf8")
  // the old screens' names over the new tokens live apart until the last old screen goes (legacy-bridge.css)
  + readFileSync(new URL("../../../tokens/legacy-bridge.css", import.meta.url), "utf8");

test("themes.css holds the four designer blocks with the same token names", () => {
  const names = THEMES.map((t) => {
    const m = new RegExp(`:root\\[data-theme="${t}"\\] \\{([\\s\\S]*?)\\n\\}`).exec(css);
    assert.ok(m, `themes.css has no block for ${t}`);
    return [...m[1].matchAll(/(--[a-z0-9-]+):/g)].map((x) => x[1]).sort().join(",");
  });
  assert.ok(names.every((n) => n === names[0]), "the four themes do not define the same tokens");
  for (const k of ["--bg", "--accent", "--text", "--panel-solid", "--tile", "--dur-2"]) assert.ok(names[0].includes(k), `the themes lost ${k}`);
});

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
  // colours a component defines for itself (a board's cells, a die) are not the brand's palette
  const own = new Set<string>();
  for (const f of [...walk(`${root}`), ...walk(`${root}../tokens`)]) {
    for (const m of readFileSync(f, "utf8").matchAll(/(--c-[a-z0-9-]+):\s*(?!var\(--(bg|panel|tile|accent|text|on-accent|theirs|acc-))/g)) own.add(m[1]);
  }
  const palette = ["--c-night", "--c-nav-bar", "--c-sheet", "--c-panel", "--c-panel2", "--c-text", "--c-muted", "--c-ink", "--c-lime", "--c-peach", "--c-coral", "--c-lilac", "--c-yellow", "--c-avatar-1", "--c-avatar-2", "--c-avatar-3", "--c-avatar-4", "--c-avatar-5"];
  const missing = palette.filter((c) => used.has(c) && !aliased.has(c));
  assert.deepEqual(missing, [], `palette colours in use with no theme alias: ${missing.join(", ")}`);
  const stray = [...used].filter((c) => !aliased.has(c) && !own.has(c));
  assert.deepEqual(stray, [], `--c-* in use that nothing defines: ${stray.join(", ")}`);
});

test("sea writes on its panel until the screens have panels of their own (contrast of --text on the page >= 4.5)", () => {
  const hex = (t: string, k: string) => new RegExp(`:root\\[data-theme="${t}"\\] \\{[\\s\\S]*?${k}: (#[0-9a-f]{6})`).exec(css)?.[1] ?? "";
  const lum = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const over = /:root\[data-theme="sea"\] \{ --c-night: var\(--(\w[\w-]*)\)/.exec(css)?.[1];
  for (const t of THEMES) {
    const page = t === "sea" && over ? hex(t, `--${over}`) : hex(t, "--bg");
    assert.ok(ratio(hex(t, "--text"), page) >= 4.5, `${t}: --text on the page is ${ratio(hex(t, "--text"), page).toFixed(2)}`);
  }
});

test("every old tone that carries --c-ink reads in every theme (contrast >= 3 for the bold tile text; 5 tones x 4 themes)", () => {
  const block = (sel: string) => [...css.matchAll(new RegExp(`:root${sel.replace(/[[\]"]/g, "\\$&")} \\{([^}]*)\\}`, "g"))].map((m) => m[1]).join(";");
  const vars = (t: string) => {
    const d: Record<string, string> = {};
    for (const b of [block("[data-theme]"), block(`[data-theme="${t}"]`)]) for (const m of b.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) d[m[1]] = m[2].trim();
    const get = (k: string, n = 0): string => { const v = d[k]; if (!v || n > 5) return ""; const r = /^var\((--[a-z0-9-]+)\)$/.exec(v); return r ? get(r[1], n + 1) : v; };
    return get;
  };
  const lum = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const low: string[] = [];
  for (const t of THEMES) {
    const get = vars(t), ink = get("--c-ink");
    for (const tone of ["--c-lime", "--c-yellow", "--c-peach", "--c-coral", "--c-lilac"]) {
      const bg = get(tone);
      assert.match(bg, /^#[0-9a-f]{6}$/i, `${t} ${tone} is «${bg}»`);
      if (ratio(bg, ink) < 3) low.push(`${t} ${tone} ${ratio(bg, ink).toFixed(2)}`);
    }
  }
  assert.deepEqual(low, [], `tones a tile's text does not read on: ${low.join(", ")}`);
});


test("a kept value that names an object's own property («toString», «__proto__») is no theme: the default (panel 26.10 #1)", () => {
  const store = (v: string) => ({ getItem: () => v, setItem() {}, removeItem() {} });
  for (const v of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    assert.equal(readChoice(store(v)), "colour", `«${v}» read as a choice`);
    assert.ok(THEMES.includes(resolveTheme(readChoice(store(v)), true)), `«${v}» gave no theme`);
  }
});

test("themes.css is the prototype's tokens.css verbatim (scripts/design/proto-extract.py), the four themes and their --pc-* colours", () => {
  const proto = readFileSync(new URL("../../../../docs/newdesign/proto/tokens.css", import.meta.url), "utf8");
  const themes = readFileSync(new URL("../../../tokens/themes.css", import.meta.url), "utf8");
  assert.equal(themes, proto, "app/tokens/themes.css drifted from docs/newdesign/proto/tokens.css");
  for (const t of THEMES) assert.match(themes, new RegExp(`:root\\[data-theme="${t}"\\] \\{ --pc-1: `), `${t} has no --pc-* block`);
});
