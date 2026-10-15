// Load bots for the local stand: many people at once, through the real client.
//
// Each bot is a depth/core Client (the terminal's and the web's shared core: signed
// requests, the PIN/vault/paper-code registration, sealed chat), so the node
// sees what it sees from a person, not a hand-made request. Per bot:
// register -> confirm the paper code -> accept the legal documents -> publish
// 1-4 phrases spread over its first step -> read the feed and the inbox every
// 10-20 s -> like 1-3 phrases (preferring the authors who liked it, so matches
// really happen) -> consent to a match -> send 2-5 sealed lines in the chat.
//
// Two phases. WARM-UP (step 0, logged, not measured): every bot of the whole ladder
// registers first, and the venues' cabinets are made and their offers published,
// so the Argon2/PIN/key work of 150 sign-ups never stands in the measured
// seconds. MEASURED LADDER (--steps 10,30,60,...): each step wakes the next bots
// (bot n is awake from the first step whose number exceeds n) and runs
// --step-seconds; the earlier bots carry on.
//
// The driver is split over --drivers K processes (run.sh starts K containers; bot n
// belongs to driver n % K) so that no Node process is the bottleneck. They meet at
// a barrier in --out (ready.<k> files) and start the ladder at the same instant;
// a stop file (stop.<k>) from any of them stops all. Each step line carries the
// driver's event-loop delay p99 (target <= 50 ms); a latency sample taken while
// the loop was lagging over --max-lag-ms is "driver-bound" and does not stop the
// run. The stop rules: p95 over the last 30 s > --max-p95-ms (client side), the
// step's error rate > --max-error-rate, any 5xx (--stop-on-5xx). The verdict is
// analyze.py's, on the node's own milliseconds (joined by x-request-id).
//
// Venues (--offers FILE, offers.jsonl; driver 0, in the warm-up): an advertiser per
// venue signs into the cabinet as adv.<brand>.place's page does (POST /adv/signup,
// the link read from the stand's Mailpit, POST /adv/session), makes the venue with
// its point and radius, orders the envelope and enters its code (read from the
// database: the paper envelope is posted to the venue, which the stand cannot do),
// then publishes the venue's offers (POST /adv/offers). Venues alternate between
// the brands. Logged as bot "adv-N". A step the stand cannot give is named in a
// {kind:"note"} line and that part stops; the bots go on.
//
// bots-<k>.jsonl, one line per HTTP call: {kind:"req", t, bot, step, action, route,
// status, ms, err, rid}; t is epoch ms, ms is the call alone (headers received), rid
// the node's x-request-id; err is null for a success and for a refusal that is the
// node doing its job (--soft-statuses: 404, 409, 422, with soft:true). Also
// {kind:"publish"|"offer"|"note"}, a {kind:"step"} per step, {kind:"run"} at start/end.
//
// Chat is the sealed HTTP path (POST /chats/:id/messages); the WebSocket room a
// live client also holds is NOT opened, so receive-side fan-out is not loaded.
//
// Runs in a container with the repo mounted (scripts/load/run.sh): nothing on the
// host. Needs node >= 24 (--experimental-transform-types: the client's constructor
// uses parameter properties).
//
//   node --experimental-transform-types scripts/load/bots.mjs --out DIR --driver 0 --drivers 3 \
//     --base http://xor-local-sosed-node-1:8080 --corpus /corpus \
//     --steps 10,30,60,100,150 --step-seconds 150

import { AsyncLocalStorage } from "node:async_hooks";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { createWriteStream, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { lookup } from "node:dns/promises";
import { join } from "node:path";
import { Client } from "../../depth/core/client.ts";
import { newPaperCode } from "../../depth/core/paper.ts";
import { acceptAll, readManifest, toAccept } from "../../depth/core/legal.ts";

// ---- arguments ----
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
const arg = (name, fallback) => args.get(name) ?? fallback;
const OUT = arg("out", "./load-out");
let BASE = arg("base", "http://xor-local-sosed-node-1:8080");
const CORPUS = arg("corpus", "/corpus");
const STEPS = arg("steps", "10,30,60,100,150").split(",").map(Number);
const STEP_S = Number(arg("step-seconds", "150"));
const MAX_P95 = Number(arg("max-p95-ms", "2000"));
const MAX_ERR = Number(arg("max-error-rate", "0.01"));
const STOP_5XX = arg("stop-on-5xx", "true") !== "false";
const SOFT = new Set(arg("soft-statuses", "404,409,422").split(",").map(Number));
const KEY = { sosed: arg("key-sosed", "ak_pub_webtest0000000001"), neighbro: arg("key-neighbro", "ak_pub_loadneighbro0001") };
const ORIGIN_TOKEN = arg("origin-token", "web-test-origin-token");
const IP_OFFSET = Number(arg("ip-offset", String(Math.floor(Math.random() * 254))));
const REG_PARALLEL = Number(arg("register-parallel", "4"));
const DRIVER = Number(arg("driver", "0"));
const DRIVERS = Number(arg("drivers", "1"));
const MAX_LAG = Number(arg("max-lag-ms", "100"));
const OFFERS = ((v) => v === "none" ? "" : v)(arg("offers", existsSync(join(CORPUS, "offers.jsonl")) ? join(CORPUS, "offers.jsonl") : ""));  // "none": no venues
let MAILPIT = arg("mailpit", "http://xor-local-sosed-mailpit-1:8025");
const PG_URL = arg("pg-url", "postgres://relay:test@xor-local-sosed-postgres-1:5432/relay_test");
const DOMAIN = { sosed: "sosed.place", neighbro: "neighbro.place" }; // the cabinet's Origin is https://adv.<domain>
// Names are resolved once: a name looked up per new connection went through the container's
// resolver and failed with ENOTFOUND under ~1000 calls/minute (measured 15.10, step 3), which
// the first runs read as a slow node. The address is the stand's for the length of the run.
const toIp = async (u) => { const x = new URL(u); if (!/^[\d.]+$/.test(x.hostname)) x.hostname = (await lookup(x.hostname, { family: 4 })).address; return x.origin; };
BASE = await toIp(BASE); MAILPIT = await toIp(MAILPIT);
const PIN = "123456";
const HOME = { lat: 34.6823, lon: 33.0464 };
process.env.DEPTH_ORIGIN_TOKEN = ORIGIN_TOKEN; // makes the client send x-origin-token; x-client-ip is replaced below

const log = createWriteStream(join(OUT, `bots-${DRIVER}.jsonl`), { flags: "a" });
const emit = (o) => log.write(JSON.stringify(o) + "\n");
const sleep = (ms, signal) => new Promise((res) => {
  const timer = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); res(); }, { once: true });
});
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

// ---- state shared by the bots and the step loop ----
const run = { step: 0, stepReq: 0, stepErr: 0, stepAll: [], window: [], stop: null, lagNow: 0, loopLag: monitorEventLoopDelay() };
run.loopLag.enable();
const ctx = new AsyncLocalStorage();

// ---- the instrumented fetch: times and logs every call, sets the bot's address ----
const realFetch = globalThis.fetch;
const routeOf = (method, url) => {
  const path = new URL(url).pathname
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}/g, ":id")
    .replace(/\/(matches|chats|feed|blocks|hidden)\/[^/]+/g, "/$1/:id");
  return `${method} ${path}`;
};
globalThis.fetch = async (input, init = {}) => {
  const c = ctx.getStore();
  if (!c) return realFetch(input, init);
  const headers = { ...(init.headers ?? {}), "x-client-ip": c.ip };
  const method = init.method ?? "GET";
  const t0 = performance.now();
  const at = Date.now();
  let status = 0, err = null, soft = false, response, ms = 0, rid = null;
  try {
    response = await realFetch(input, { ...init, headers });
    status = response.status;
    ms = performance.now() - t0;
    rid = response.headers.get("x-request-id");
    if (status >= 400) {
      const body = (await response.clone().text().catch(() => "")).slice(0, 200);
      soft = SOFT.has(status);
      if (!soft) err = `${status} ${body}`;
      else err = null;
      if (soft) c.softNote = body;
    }
  } catch (e) {
    err = `network: ${e?.cause?.code ?? e?.message ?? e}`;
    record({ at, c, method, input, status: 0, ms: performance.now() - t0, err, soft, rid });
    throw e;
  }
  record({ at, c, method, input, status, ms, err, soft, rid });
  return response;
};

function record({ at, c, method, input, status, ms, err, soft, rid }) {
  const url = typeof input === "string" ? input : input.url ?? String(input);
  const line = { kind: "req", t: at, bot: c.bot, step: run.step, action: c.action, route: routeOf(method, url), status, ms: Math.round(ms * 10) / 10, err, rid };
  if (soft) line.soft = true;
  emit(line);
  if (run.step > 0) { // the warm-up is logged, not measured
    run.stepReq++;
    run.stepAll.push(ms);
    if (err) run.stepErr++;
    run.window.push({ at, ms, err: !!err, s5: status >= 500 || status === 0, bound: run.lagNow > MAX_LAG });
  }
  if (STOP_5XX && (status >= 500) && !run.stop) run.stop = `5xx: ${method} ${routeOf(method, url)} -> ${status}`;
}

function note(c, action, err) {
  emit({ kind: "req", t: Date.now(), bot: c.bot, step: run.step, action, route: "-", status: -1, ms: 0, err: String(err?.message ?? err).slice(0, 300) });
  if (run.step > 0) { run.stepReq++; run.stepErr++; run.window.push({ at: Date.now(), ms: 0, err: true, s5: false, bound: false }); }
}

// ---- phrases: each used once; the node takes <= 128 graphemes ----
const seg = new Intl.Segmenter();
const phrases = [];
for (const f of readdirSync(CORPUS).filter((n) => /^(corpus|topics)-?.*\.jsonl$/.test(n)).sort()) {
  for (const line of readFileSync(join(CORPUS, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    // seven digits in a row read as a telephone to the queue's rules
    if ([...seg.segment(p.text)].length <= 128 && !/\d{7}/.test(p.text.replace(/[ \-]/g, ""))) phrases.push(p);
  }
}
// each driver takes its own share, so no phrase is used twice across drivers
const mineOnly = phrases.filter((_, i) => i % DRIVERS === DRIVER);
phrases.length = 0; phrases.push(...mineOnly);
for (let i = phrases.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [phrases[i], phrases[j]] = [phrases[j], phrases[i]]; }
let exhaustedNoted = false;

// ---- who wrote what, who liked whom (the harness knows; a bot uses it only to reciprocate) ----
const authorOf = new Map();   // phraseId -> bot
const likedBy = new Map();    // bot -> Set(bots who liked one of its phrases)
const NAMES = ["Аня", "Борис", "Вера", "Глеб", "Дина", "Егор", "Zoe", "Nick", "Maria", "Andreas", "Elena", "Petros"];
const LINES = ["hi, saw your phrase", "привет, это про меня", "where exactly?", "когда удобно?", "sounds good", "давай", "I can after six", "после работы могу", "ok see you", "до встречи"];

const jitter = () => {
  const r = 300 * Math.sqrt(Math.random()), a = Math.random() * 2 * Math.PI;
  return { lat: HOME.lat + (r * Math.cos(a)) / 111320, lon: HOME.lon + (r * Math.sin(a)) / (111320 * Math.cos((HOME.lat * Math.PI) / 180)) };
};

let registering = 0;
const waiters = [];
async function withRegSlot(fn) {
  while (registering >= REG_PARALLEL) await new Promise((r) => waiters.push(r));
  registering++;
  try { return await fn(); } finally { registering--; waiters.shift()?.(); }
}

// ---- one bot: prepare (warm-up) then act (measured) ----
async function prepare(n) {
  const brand = n % 2 === 0 ? "sosed" : "neighbro";
  const c = { bot: n, brand, ip: `203.0.113.${1 + ((IP_OFFSET + n) % 254)}`, action: "register" };
  return ctx.run(c, async () => {
    const client = new Client(BASE, KEY[brand]);
    try {
      await withRegSlot(async () => {
        await client.register({ name: pick(NAMES), age: 18 + Math.floor(rnd(0, 40)) }, { pin: PIN, paperCode: newPaperCode() });
      });
      await client.confirmPaperCode();
      c.action = "legal";
      const manifest = await readManifest(client);
      if (manifest) await acceptAll(client, toAccept(manifest, {}));
    } catch (e) { note(c, "register", e); return null; }
    return { n, brand, c, client };
  });
}

async function act(st, signal) {
  const { n, brand, c, client } = st;
  return ctx.run(c, async () => {
    const at = jitter();
    const radius = 1000;
    const t0 = Date.now();
    const plan = Array.from({ length: 1 + Math.floor(Math.random() * 4) }, () => t0 + rnd(2, Math.max(3, STEP_S - 5)) * 1000).sort((a, b) => a - b);
    let likesLeft = 1 + Math.floor(Math.random() * 3);
    const consented = new Set();      // match ids I agreed to
    const chats = new Map();          // chat id -> { sent, target, next, matchId }
    const mine = new Set();
    let seen = new Map();

    const tryConsent = async (matchId) => {
      if (consented.has(matchId)) return;
      consented.add(matchId);
      c.action = "consent";
      try { await client.consent(matchId); } catch (e) { note(c, "consent", e); }
    };

    while (!signal.aborted) {
      // publish what is due
      while (plan.length && plan[0] <= Date.now()) {
        plan.shift();
        const p = phrases.pop();
        if (!p) { if (!exhaustedNoted) { exhaustedNoted = true; emit({ kind: "note", t: Date.now(), msg: "corpus exhausted: no more phrases to publish" }); } continue; }
        c.action = "publish";
        try {
          const a = await client.say({ text: p.text, mode: pick(["company", "company", "alone", "party"]), ...jitter(), radius, lang: p.lang });
          emit({ kind: "publish", t: Date.now(), bot: n, step: run.step, brand, topic: p.topic ?? null, lang: p.lang, status: a.status, phrase_id: a.body?.id ?? null });
          if (a.status === 200 && a.body?.id) { authorOf.set(a.body.id, n); mine.add(a.body.id); }
        } catch (e) { note(c, "publish", e); }
      }
      // read the feed
      c.action = "feed";
      try {
        const feed = await client.feed({ ...at, radius });
        seen = new Map(feed.items.filter((i) => i.kind === "phrase" && !mine.has(i.id)).map((i) => [i.id, i]));
      } catch (e) { note(c, "feed", e); }
      // like: first the authors who liked me, then anybody
      if (likesLeft > 0 && seen.size && Math.random() < 0.6) {
        const owed = likedBy.get(n) ?? new Set();
        const back = [...seen.keys()].filter((id) => owed.has(authorOf.get(id)));
        const id = back.length && Math.random() < 0.85 ? pick(back) : pick([...seen.keys()]);
        c.action = "like";
        try {
          const a = await client.like(id);
          if (a.status === 200) {
            likesLeft--; seen.delete(id);
            const author = authorOf.get(id);
            if (author !== undefined) { if (!likedBy.has(author)) likedBy.set(author, new Set()); likedBy.get(author).add(n); }
            if (a.body?.match_id) await tryConsent(a.body.match_id);
          }
        } catch (e) { note(c, "like", e); }
      }
      // inbox: matches waiting for me, chats ready for words
      c.action = "inbox";
      try {
        for (const row of await client.inbox()) {
          if (row.kind === "match" && row.my_consent !== "waiting") await tryConsent(row.match_id ?? row.id);
          if (row.kind === "chat" && row.match_id && consented.has(row.match_id) && !chats.has(row.id)) {
            chats.set(row.id, { sent: 0, target: 2 + Math.floor(Math.random() * 4), next: 0, matchId: row.match_id });
          }
        }
      } catch (e) { note(c, "inbox", e); }
      // chat: a line every few seconds until the target
      for (const [chatId, s] of chats) {
        if (s.sent >= s.target || s.next > Date.now()) continue;
        c.action = "chat";
        try {
          const a = await client.sayInChat(chatId, pick(LINES), s.matchId);
          if (a.status === 200 || a.status === 202) { s.sent++; s.next = Date.now() + rnd(3, 8) * 1000; }
        } catch (e) { note(c, "chat", e); s.sent = s.target; }
      }
      await sleep(rnd(10, 20) * 1000, signal);
    }
  });
}

// ---- advertisers: one cabinet account per venue ----
const RADII = [100, 300, 1000, 3000, 10000];
const clip = (text, max) => { // by graphemes, at a word when it can
  const g = [...seg.segment(text)].map((x) => x.segment);
  if (g.length <= max) return text;
  const cut = g.slice(0, max).join("");
  return cut.replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") || cut;
};
const discountOf = (text) => text.match(/\d+\s?%/)?.[0] ?? text.match(/\d+[.,]\d\d\s?(?:€|EUR|eur)?/)?.[0]?.slice(0, 32) ?? "deal";

async function advertiser(n, v, signal) {
  const brand = n % 2 === 0 ? "sosed" : "neighbro";
  const c = { bot: `adv-${n}`, brand, ip: `203.0.113.${1 + ((IP_OFFSET + 127 + n) % 254)}`, action: "adv-signup" };
  const origin = `https://adv.${DOMAIN[brand]}`;
  const email = `venue-${Date.now().toString(36)}-${n}@loadtest.invalid`;
  const jar = {};
  const call = async (method, path, body) => {
    const headers = { origin, "x-origin-token": ORIGIN_TOKEN, ...(body ? { "content-type": "application/json" } : {}),
      cookie: Object.entries(jar).map(([k, x]) => `${k}=${x}`).join("; ") };
    const r = await fetch(new URL(path, BASE), { method, headers, body: body ? JSON.stringify(body) : undefined });
    for (const sc of r.headers.getSetCookie?.() ?? []) { const [kv] = sc.split(";"); const i = kv.indexOf("="); const val = kv.slice(i + 1); if (val) jar[kv.slice(0, i)] = val; else delete jar[kv.slice(0, i)]; }
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* 204 or a proxy's page */ }
    return { status: r.status, json };
  };
  await ctx.run(c, async () => {
    try {
      let a = await call("POST", "/adv/signup", { email, contact: v.venue });
      if (a.status !== 204) throw new Error(`signup ${a.status}`);
      // the letter: Mailpit's API, not the node's, so it is not in the node's numbers
      let token = null;
      for (let i = 0; i < 20 && !token && !signal.aborted; i++) {
        await sleep(1000, signal);
        const found = await realFetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:" + email)}`).then((r) => r.json()).catch(() => null);
        const id = found?.messages?.[0]?.ID;
        if (id) {
          const msg = await realFetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json()).catch(() => null);
          token = `${msg?.Text ?? ""} ${msg?.HTML ?? ""}`.match(/\/enter#([0-9a-f]{64})/)?.[1] ?? null;
        }
      }
      if (!token) { emit({ kind: "note", t: Date.now(), msg: `cabinet: no sign-in letter for ${email} in ${MAILPIT} within 20 s (POST /adv/signup answered 204); that venue is skipped` }); return; }
      c.action = "adv-session";
      a = await call("POST", "/adv/session", { token });
      if (a.status !== 204) throw new Error(`session ${a.status}`);
      c.action = "adv-venue";
      const radius = RADII.find((r) => r >= v.radius_m) ?? 10000;
      a = await call("POST", "/adv/venues", { name: clip(v.venue, 128), address: `${v.venue}, Limassol`, lat: v.lat, lon: v.lon, area_radius: radius });
      if (a.status !== 201) throw new Error(`venue ${a.status} ${JSON.stringify(a.json)}`);
      const venueId = a.json.id;
      c.action = "adv-envelope";
      a = await call("POST", `/adv/venues/${venueId}/envelope`);
      if (a.status !== 202) throw new Error(`envelope ${a.status}`);
      const code = await envelopeCode(venueId);
      if (!code) { emit({ kind: "note", t: Date.now(), msg: "cabinet: POST /adv/venues/:id/verify needs the envelope's code, which the node mails on paper; the stand has no post, and the database could not be read (--pg-url), so venues stay unverified and publish no offers" }); return; }
      c.action = "adv-verify";
      a = await call("POST", `/adv/venues/${venueId}/verify`, { code });
      if (a.status !== 200) throw new Error(`verify ${a.status} ${JSON.stringify(a.json)}`);
      for (const o of v.offers) {
        if (signal.aborted) return;
        c.action = "adv-offer";
        const offerText = clip(o.text, 128);
        a = await call("POST", "/adv/offers", {
          venue_id: venueId, offer_text: offerText, discount_value: discountOf(o.text),
          discount_until: new Date(Date.now() + Math.min(o.discount_days, 89) * 86_400_000).toISOString(),
        });
        emit({ kind: "offer", t: Date.now(), bot: c.bot, brand, venue: v.venue, lang: o.lang, status: a.status, clipped: offerText.length < o.text.length });
        await sleep(rnd(1, 4) * 1000, signal);
      }
    } catch (e) { note(c, c.action, e); }
  });
}
let pgSql = null;
async function envelopeCode(venueId) {
  try {
    pgSql ??= createRequire(new URL("../../depth/package.json", import.meta.url))("postgres")(PG_URL, { max: 2 });
    const [row] = await pgSql`SELECT code FROM venue_envelopes WHERE venue_id = ${venueId} AND used_at IS NULL AND burned_at IS NULL`;
    return row?.code ?? null;
  } catch (e) { emit({ kind: "note", t: Date.now(), msg: `cabinet: the database is not readable for envelope codes: ${e.message}` }); return null; }
}

// ---- the ladder ----
const pct = (xs, q) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
function windowCheck() {
  const cut = Date.now() - 30_000;
  while (run.window.length && run.window[0].at < cut) run.window.shift();
  const ms = run.window.filter((r) => r.ms > 0 && !r.bound).map((r) => r.ms);
  if (!run.stop && ms.length >= 20 && pct(ms, 0.95) > MAX_P95) run.stop = `client-side p95 ${Math.round(pct(ms, 0.95))} ms > ${MAX_P95} over the last 30 s (${ms.length} calls, driver loop healthy)`;
  if (!run.stop && run.stepReq >= 30 && run.stepErr / run.stepReq > MAX_ERR) run.stop = `error rate ${(100 * run.stepErr / run.stepReq).toFixed(1)} % > ${100 * MAX_ERR} % in step ${run.step}`;
  if (run.stop && !existsSync(join(OUT, `stop.${DRIVER}`))) writeFileSync(join(OUT, `stop.${DRIVER}`), run.stop);
  if (!run.stop) {
    const other = readdirSync(OUT).find((f) => /^stop\.\d+$/.test(f));
    if (other) run.stop = `driver ${other.slice(5)} stopped: ${readFileSync(join(OUT, other), "utf8")}`;
  }
}
// the loop's own lag, sampled every 2 s: a sample is driver-bound while it is over --max-lag-ms
setInterval(() => { run.lagNow = run.loopLag.max / 1e6; run.lagMaxStep = Math.max(run.lagMaxStep ?? 0, run.lagNow); run.lagSamples.push(run.lagNow); run.loopLag.reset(); }, 2000).unref();
run.lagSamples = [];

const abort = new AbortController();
const bots = [];
const total = Math.max(...STEPS);
emit({ kind: "run", t: Date.now(), phase: "start", driver: DRIVER, drivers: DRIVERS, base: BASE, steps: STEPS, step_seconds: STEP_S, max_p95_ms: MAX_P95, max_error_rate: MAX_ERR, max_lag_ms: MAX_LAG, phrases: phrases.length, ip_offset: IP_OFFSET });

// ---- warm-up: register every bot of the ladder, make the cabinets (step 0) ----
const warmStart = Date.now();
const ready = new Map();
const prep = [];
for (let n = DRIVER; n < total; n += DRIVERS) prep.push(prepare(n).then((st) => { if (st) ready.set(n, st); }));
if (OFFERS && DRIVER === 0) {
  const venues = readFileSync(OFFERS, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  let next = 0;
  for (let w = 0; w < 3; w++) prep.push((async () => { while (next < venues.length && !run.stop) { const k = next++; await advertiser(k, venues[k], abort.signal); } })());
  emit({ kind: "run", t: Date.now(), phase: "venues", venues: venues.length });
}
await Promise.all(prep);
emit({ kind: "run", t: Date.now(), phase: "warm-up-done", driver: DRIVER, registered: ready.size, wanted: Math.ceil((total - DRIVER) / DRIVERS), seconds: Math.round((Date.now() - warmStart) / 1000), loop_lag_max_ms: Math.round(Math.max(0, ...run.lagSamples)) });

// barrier: every driver writes ready.<k>, the ladder starts 3 s after the last one
writeFileSync(join(OUT, `ready.${DRIVER}`), String(Date.now()));
let t0 = 0;
while (!t0) {
  const files = readdirSync(OUT).filter((f) => /^ready\.\d+$/.test(f));
  if (files.length >= DRIVERS) t0 = Math.max(...files.map((f) => Number(readFileSync(join(OUT, f), "utf8")))) + 3000;
  else await sleep(500);
}
let lastOkStep = null;
const woken = new Set();
for (let i = 0; i < STEPS.length && !run.stop; i++) {
  await sleep(Math.max(0, t0 + i * STEP_S * 1000 - Date.now()));
  run.step = i + 1; run.stepReq = 0; run.stepErr = 0; run.stepAll = []; run.lagMaxStep = 0; run.lagSamples = [];
  const started = Date.now();
  for (const [n, st] of ready) {
    if (n >= STEPS[i] || woken.has(n)) continue;
    woken.add(n);
    // arrivals spread over the first quarter of the step (at most 30 s)
    bots.push(sleep(rnd(0, Math.min(30, STEP_S / 4)) * 1000, abort.signal).then(() => abort.signal.aborted ? undefined : act(st, abort.signal)));
  }
  while (Date.now() - started < STEP_S * 1000 && !run.stop) { await sleep(2000); windowCheck(); }
  const ms = run.stepAll;
  emit({ kind: "step", t: Date.now(), driver: DRIVER, step: run.step, concurrency: STEPS[i], started, ended: Date.now(), awake: woken.size, requests: run.stepReq, errors: run.stepErr,
    p50: Math.round(pct(ms, 0.5)), p95: Math.round(pct(ms, 0.95)), max: Math.round(Math.max(0, ...ms)),
    driver_loop_p99_ms: Math.round(pct(run.lagSamples, 0.99)), driver_loop_max_ms: Math.round(run.lagMaxStep), stop: run.stop });
  if (!run.stop) lastOkStep = STEPS[i];
}
abort.abort();
await Promise.race([Promise.allSettled(bots), sleep(8000)]);
emit({ kind: "run", t: Date.now(), phase: "end", driver: DRIVER, stopped_early: !!run.stop, reason: run.stop, last_ok_concurrency: lastOkStep });
await new Promise((r) => log.end(r));
console.log(run.stop ? `bots[${DRIVER}]: stopped early — ${run.stop}` : `bots[${DRIVER}]: ladder finished`);
process.exit(run.stop ? 3 : 0);
