// E2 · the moderator model against the corpus of the rules' measurement
// (scripts/measure-feed-rules.ts, taken as it is — its classes are the
// expectations). Each phrase goes through the node's own askModerator, the
// same prompt and call the node makes, to the local model. Prints one JSON
// report; relay/moderator/measure.sh runs it and the numbers go into
// docs/measurements/moderator-<date>_{RU,EN}.md untyped.
//
// What the model is expected to say, by class: clean, offer → publish; rude,
// link, link_masked, contact, contact_masked → reject. The repeat class is a
// relation between two phrases, not a text, and is left out. `rules` says
// what the rules did with the class (feed-rules-2026-09-27): which of the
// model's answers would reach a person as a hint and which it never sees.

import { askModerator, moderatorConfig } from "../node/src/lib/moderator.ts";

const source = await Deno.readTextFile(new URL("../../scripts/measure-feed-rules.ts", import.meta.url));
const start = source.indexOf("const clean = [");
const end = source.indexOf("interface Sample");
if (start < 0 || end < 0) throw new Error("the corpus of measure-feed-rules.ts moved: its arrays were not found");
const lists = new Function(`${source.slice(start, end)}; return { clean, rude, link, link_masked, contact, contact_masked, offerTexts };`)() as Record<string, string[]>;

type Klass = "clean" | "rude" | "link" | "link_masked" | "contact" | "contact_masked" | "offer";
const EXPECT: Record<Klass, "publish" | "reject"> = {
  clean: "publish", offer: "publish", rude: "reject", link: "reject", link_masked: "reject", contact: "reject", contact_masked: "reject",
};
const corpus: Array<{ klass: Klass; text: string }> = [
  ...(["clean", "rude", "link", "link_masked", "contact", "contact_masked"] as Klass[]).flatMap((k) => lists[k].map((text) => ({ klass: k, text }))),
  ...lists.offerTexts.map((text) => ({ klass: "offer" as Klass, text })),
];

const config = moderatorConfig();
if (!config) throw new Error("MODERATOR_URL is not set");
// The first answer loads the model into memory; it is timed apart.
const warm = await askModerator("гуляю у реки", { ...config, timeoutMs: 300000 });
const results: Array<{ klass: Klass; text: string; verdict: string; ms: number }> = [];
for (const s of corpus) {
  const hint = await askModerator(s.text, { ...config, timeoutMs: 120000 });
  results.push({ klass: s.klass, text: s.text, verdict: hint?.verdict ?? "failed", ms: hint?.ms ?? 0 });
}

const pct = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : 0; };
const byClass: Record<string, { n: number; publish: number; reject: number; unsure: number; failed: number; wrong: string[] }> = {};
for (const r of results) {
  const b = byClass[r.klass] ??= { n: 0, publish: 0, reject: 0, unsure: 0, failed: 0, wrong: [] };
  b.n++;
  (b as unknown as Record<string, number>)[r.verdict]++;
  if (r.verdict !== EXPECT[r.klass]) b.wrong.push(`${r.verdict}: ${r.text}`);
}
const ms = results.filter((r) => r.ms > 0).map((r) => r.ms);
console.log(JSON.stringify({
  model: config.model,
  phrases: results.length,
  warm_ms: warm?.ms ?? null,
  reject: results.filter((r) => r.verdict === "reject").length,
  publish: results.filter((r) => r.verdict === "publish").length,
  unsure: results.filter((r) => r.verdict === "unsure").length,
  failed: results.filter((r) => r.verdict === "failed").length,
  // A miss: a phrase to reject the model let through. A false catch: a phrase
  // to publish the model would reject.
  misses: results.filter((r) => EXPECT[r.klass] === "reject" && r.verdict === "publish").length,
  false_catches: results.filter((r) => EXPECT[r.klass] === "publish" && r.verdict === "reject").length,
  ms: { p50: pct(ms, 0.5), p95: pct(ms, 0.95), max: Math.max(...ms), n: ms.length },
  by_class: byClass,
  // Every phrase's verdict, in corpus order: two runs compared phrase by
  // phrase say how often the model answers the same (E2b).
  verdicts: results.map((r) => ({ klass: r.klass, text: r.text, verdict: r.verdict })),
}, null, 2));
