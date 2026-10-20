// createPhrase (phrase.ts): a phrase's outcome and the node's refusals as words, on a stand-in client. No node.
import { assertEquals } from "jsr:@std/assert@1";
import type { Client } from "../core/client.ts";
import { createPhrase } from "./phrase.ts";

const say = (key: string, values?: Record<string, string | number>) => `${key}${values ? JSON.stringify(values) : ""}`;
const phrase = { text: "кофе во дворе", mode: "alone" as const, lat: 41.7, lon: 44.8, radius: 1000 as const };

function client(status: number, body: unknown, phrases: Array<{ expires_at?: number }> = []) {
  const sent: unknown[] = [];
  const c = {
    say: async (p: unknown) => { sent.push(p); return { status, body }; },
    profile: async () => ({ phrases }),
  } as unknown as Client;
  return { c, sent };
}

Deno.test("sayPhrase: 200 is published, 202 is checking, in the face's language", async () => {
  const { sayPhrase } = createPhrase({ say, lang: "ka" });
  const a = client(200, { id: "p1" });
  assertEquals(await sayPhrase(a.c, phrase), { state: "published", id: "p1" });
  assertEquals((a.sent[0] as { lang: string }).lang, "ka");
  assertEquals(await sayPhrase(client(202, { id: "p2" }).c, phrase), { state: "checking", id: "p2" });
});

Deno.test("sayPhrase: four live phrases — the refusal names the earliest end of one's own", async () => {
  const { sayPhrase } = createPhrase({ say, lang: "en" });
  const end = Date.UTC(2026, 9, 18, 9, 5) / 1000;
  const got = await sayPhrase(client(409, { error: { code: "refused", live: 4 } }, [{ expires_at: end + 3600 }, { expires_at: end }]).c, phrase);
  const time = new Date(end * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  assertEquals(got, { state: "refused", why: `write.live${JSON.stringify({ time })}` });
});

Deno.test("refusalWording: a pause, the hour's slot, too fast, a phrase under a person's check", async () => {
  const { refusalWording } = createPhrase({ say, lang: "en" });
  const c = client(0, null).c;
  assertEquals((await refusalWording(c, { status: 429, body: { error: { until: 0 } } })).startsWith("write.paused"), true);
  assertEquals((await refusalWording(c, { status: 429, body: { error: { next_slot: 0 } } })).startsWith("write.hourly"), true);
  assertEquals(await refusalWording(c, { status: 429, body: {} }), "write.rapid");
  assertEquals(await refusalWording(c, { status: 409, body: { error: { checking: true } } }), "write.hold");
  assertEquals(await refusalWording(c, { status: 409, body: { error: { code: "stepped_away" } } }), "away.line");
});

Deno.test("refusalText: a known code is its own words, the rest is told by its number", () => {
  const { refusalText } = createPhrase({ say, lang: "en" });
  assertEquals(refusalText("phrase", "moderation_refused", 422), "web.phrase.refused_generic");
  assertEquals(refusalText("phrase", undefined, 500), `web.phrase.refused_status${JSON.stringify({ status: 500 })}`);
  assertEquals(refusalText("like", undefined, 409), "web.like.needs_phrase");
});
