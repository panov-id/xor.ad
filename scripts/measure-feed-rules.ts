// The driver of scripts/measure-feed-rules.sh: a corpus of phrases by class
// against a live node with FEED_VERDICT=rules, through depth/core Client — the
// same signed calls a face makes. Prints one JSON report to stdout; the shell
// script puts it into the document.
//
// Classes and what the rules of §8.3 (lib/feed_verdict.ts readText) are meant
// to do with them:
//   clean        published at once — a phrase of the feed
//   rude         published at once — the rules read shapes, not words; a word
//                list is the model's or a person's (§8.14), and its absence is
//                the measurement's point, not its defect
//   link         queued — a scheme, www., a bare host with a Latin TLD
//   link_masked  queued if the rules unmask it, a FALSE PASS if not: пример.рф
//                (Cyrillic TLD), example[.]com, example (dot) com, hxxp://,
//                spaces around the dot, a zero-width space inside t.me
//   contact      queued — mail, @handle, a messenger by name, a phone
//   contact_masked  queued or a false pass: «пиши в тг», phones with spaces
//                and dashes, "at"/"dot" spelled out, a handle after a comma
//   offer        queued whole — a phrase with a discount waits for a person
//   repeat       queued — the same phrase again while the first is live
// A "false catch" is a clean or rude phrase the rules queued.
//
// One identity per phrase (a queued phrase blocks the author's next one and
// four an hour is the ceiling); the repeat class uses two phrases of one identity.

import { Client } from "../depth/core/client.ts";
import { newPaperCode } from "../depth/core/paper.ts";

const node = Deno.env.get("MEASURE_NODE_URL") ?? "http://node:8080";
const apiKey = Deno.env.get("MEASURE_API_KEY") ?? "ak_pub_measurerules00001";
const PLACE = { lat: 55.75, lon: 37.62, radius: 1000 as const };

type Klass = "clean" | "rude" | "link" | "link_masked" | "contact" | "contact_masked" | "offer" | "repeat";
const EXPECT: Record<Klass, "published" | "queued"> = {
  clean: "published", rude: "published", link: "queued", link_masked: "queued",
  contact: "queued", contact_masked: "queued", offer: "queued", repeat: "queued",
};

const clean = [
  "гуляю у реки, если кто рядом", "кто на набережную вечером?", "ищу компанию на пробежку в семь",
  "отдам котёнка в добрые руки", "у моста через час, кто со мной", "кофе на веранде, солнце, сяду у окна",
  "играем в настолки в парке", "кто видел рыжего кота у подъезда", "иду в кино на девять, есть лишний билет",
  "нужна помощь донести шкаф на третий", "собираем мусор у пруда в субботу", "подскажите хорошего парикмахера рядом",
  "у кого есть дрель на час", "сажаем цветы у дома, приходите", "играю на гитаре во дворе, подпевайте",
  "ищу партнёра по шахматам", "кто идёт на рынок утром", "продаю велосипед, детский", "потерялся зонт у остановки",
  "смотрим футбол у меня, чипсы есть", "учу испанский, ищу с кем говорить", "бегаю по утрам в шесть",
  "кто в баню в пятницу", "ищу няню на вечер", "меняю книги, приносите свои", "готовлю плов, заходите",
  "кто разбирается в пылесосах", "нашла ключи у школы", "во дворе слишком темно, напишем в управу вместе?",
  "рисую акварелью, ищу компанию", "иду на каток вечером", "кто хочет на рыбалку в шесть утра",
  "печём пироги по субботам", "нужен переводчик на час", "сдам гараж на месяц", "ищу попутчика до центра",
  "кто знает, где починить обувь", "собираю грибы, кто со мной", "показываю звёзды в телескоп сегодня",
  "нужно помочь бабушке с окном", "детская площадка сломана, соберёмся?", "иду в бассейн, есть абонемент на двоих",
  "ищу учителя музыки для сына", "давайте субботник во дворе", "мой кот сбежал, серый с белым",
  "кто хочет учиться жонглировать", "покажу район новым соседям", "иду за грибами, нужен второй",
  "у кого есть удлинитель на вечер", "пойдём в музей в воскресенье", "ищу собеседника для прогулок",
  "кто со мной на выставку", "варю кофе на всех у фонтана", "нужна пила на день", "играю в теннис, ищу пару",
  "танцую сальсу, ищу партнёра", "подарю рассаду", "кто ремонтирует велосипеды", "смотрим закат с крыши",
  "читаем стихи в парке в семь", "у меня остались доски, заберите", "ищу с кем гулять с собаками",
  "поедем на дачу в выходные", "покажу, как варить сыр", "кто идёт на концерт в сквере",
  "ищу компанию в горы", "у нас сломался лифт, кто уже звонил", "выгуляю вашу собаку", "нужен совет по кредиту",
  "кто помнит, что тут было раньше", "ищу репетитора по математике", "варю глинтвейн, заходите", "иду в лес, кто со мной",
  "нужна помощь с компьютером", "устроим кино во дворе", "ищу пекарню с хлебом на закваске", "кто продаёт мёд рядом",
  "подвезу до аэропорта завтра утром", "у кого есть велосипедный насос", "кто со мной на йогу в парке",
  "отдам детские книги", "ищу партнёра по бадминтону", "поём в хоре, приходите", "кто знает тихое кафе рядом",
  "иду на речку, вода тёплая", "нужен второй для пинг-понга", "покажу район с крыши", "ищу компанию на завтрак",
  "проведу экскурсию по нашему району", "гуляю с коляской в парке, кто тоже", "делаю мебель, покажу мастерскую",
  "кто со мной в квест", "поливаю цветы соседям, могу и вам", "иду на лекцию в библиотеку",
  "ищу того, кто чинит часы", "собираем яблоки в саду", "устроим чаепитие во дворе", "нужен свидетель на встречу с ЖК",
  "меняю пластинки", "кто хочет научиться печь хлеб", "пошли на каяках", "ищу компаньона в театр",
  "у нас во дворе ёж", "кто может подсказать врача", "иду за клюквой", "кто со мной на стадион",
];
const rude = [
  "да пошёл ты, сосед сверху, задолбал сверлить", "какой же дурак припарковался у ворот", "хватит орать ночью, идиоты",
  "ненавижу этот двор и всех в нём", "у кого мозги есть — уберите мусор", "заткнись уже со своей дрелью",
  "чёрт бы побрал этого управдома", "опять эти уроды с петардами", "тупые водители, весь газон переехали",
  "надоели, честное слово, свиньи", "кто эта дура с колонкой в шесть утра", "убью того, кто гадит в лифте",
  "проваливайте со своим шашлыком", "мерзкие соседи с пятого", "хамло на кассе, не ходите туда",
  "балбес на самокате сбил бабушку", "бездарь этот наш дворник", "кретины, зачем спилили тополь",
  "паразиты, опять отключили воду", "гнида, а не сосед",
];
const link = [
  "смотрите https://example.com/party", "подробности на www.example.org", "вся инфа тут: example.com",
  "ссылка http://t.me/joinchat/abc", "жду на example.ru", "запись на mysite.net/form", "фото в vk.com/id123",
  "читайте example.info", "заходите на club.example.co.uk сегодня", "новости на news.example.de",
  "карта тут maps.example.com", "билеты на ticket.example.io", "смотри youtube.com/watch", "ищи example.app",
  "инстаграм instagram.com/me", "сайт bakery.example.shop", "форум forum.example.su", "example.net ждёт",
  "https://example.ru/", "доски объявлений example.biz",
];
const link_masked = [
  "сайт пример.рф", "заходите на example[.]com", "пишите на example (dot) com", "example dot com — там всё",
  "hxxp://example.com", "example . com, вечером", "t​.me/joinchat", "ex ample.com", "example.c0m",
  "www example com", "пример точка рф", "example[dot]com", "example(.)com", "сайт пример . рф",
  "ссылку скину в личку, пример.ру", "e-x-a-m-p-l-e.com", "example，com", "example｡com", "site: example／com",
  "тут: example dot ru dot com",
];
const contact = [
  "пишите на mail@example.com", "мой телеграм @sosed_ok", "звоните +7 999 123-45-67", "whatsapp 89991234567",
  "ищите в viber", "почта anna.k@mail.ru", "тг: @anna_k", "тел. 8 (999) 123 45 67", "телеграм anna", "snapchat ann",
];
const contact_masked = [
  "пиши в тг", "пишите в телегу", "мой номер 9 9 9 1 2 3 4 5 6 7", "звони 999-123-45-67", "anna (at) mail (dot) ru",
  "anna собака mail точка ru", "ватсап есть, пиши", "ищи меня, @anna, вечером", "телефон девять девять девять один два три",
  "номер 99912345 67", "в вайбере тоже", "снапчат ann", "пиши в личку тг", "wa: +7 999 1234567", "mail: anna @ mail . ru",
];
const offerTexts = ["отдам две табуретки", "кофе со скидкой до вечера", "стрижка соседям дешевле", "сдам дрель за спасибо",
  "отдам шкаф самовывозом", "пироги по цене муки", "велосипед недорого соседям", "уроки гитары со скидкой",
  "массаж соседям минус треть", "выгул собак бесплатно первую неделю"];
const repeatTexts = ["гуляю у реки", "иду к мосту", "кто на каток", "варю кофе у фонтана", "ищу пару в теннис",
  "печём пироги", "иду в бассейн", "показываю звёзды", "меняю книги", "субботник во дворе"];

interface Sample { klass: Klass; text: string; offer?: boolean }
const corpus: Sample[] = [
  ...clean.map((t) => ({ klass: "clean" as Klass, text: t })),
  ...rude.map((t) => ({ klass: "rude" as Klass, text: t })),
  ...link.map((t) => ({ klass: "link" as Klass, text: t })),
  ...link_masked.map((t) => ({ klass: "link_masked" as Klass, text: t })),
  ...contact.map((t) => ({ klass: "contact" as Klass, text: t })),
  ...contact_masked.map((t) => ({ klass: "contact_masked" as Klass, text: t })),
  ...offerTexts.map((t) => ({ klass: "offer" as Klass, text: t, offer: true })),
];

async function person(): Promise<Client> {
  const c = new Client(node, apiKey);
  await c.register({ name: "Аня", age: 30 }, { pin: "246813", paperCode: newPaperCode() });
  await c.confirmPaperCode();
  return c;
}

interface Result { klass: Klass; text: string; status: number; state: string; ms: number; expected: string; ok: boolean }
const results: Result[] = [];

async function say(c: Client, s: Sample): Promise<Result> {
  const t0 = performance.now();
  const answer = await c.request<{ state?: string; error?: { code?: string } }>("POST", "/feed", {
    text: s.text, mode: "alone", lat: PLACE.lat, lon: PLACE.lon, area_radius: PLACE.radius,
    ...(s.offer ? { discount_value: "10%", conditions: "соседям" } : {}),
  });
  const ms = performance.now() - t0;
  const state = answer.status === 200 ? "published" : answer.status === 202 ? "queued" : `refused:${answer.status}:${answer.body?.error?.code ?? ""}`;
  const r: Result = { klass: s.klass, text: s.text, status: answer.status, state, ms, expected: EXPECT[s.klass], ok: state === EXPECT[s.klass] };
  results.push(r);
  return r;
}

// Registrations in parallel, in small groups: argon2 on the client is the cost.
const GROUP = 8;
const started = performance.now();
for (let i = 0; i < corpus.length; i += GROUP) {
  const slice = corpus.slice(i, i + GROUP);
  const people = await Promise.all(slice.map(() => person()));
  for (let j = 0; j < slice.length; j++) await say(people[j], slice[j]);
  console.error(`… ${Math.min(i + GROUP, corpus.length)}/${corpus.length}`);
}
// The repeat class: the first phrase published, the same text again.
for (const text of repeatTexts) {
  const c = await person();
  const first = await c.request<{ state?: string }>("POST", "/feed", { text, mode: "alone", lat: PLACE.lat, lon: PLACE.lon, area_radius: PLACE.radius });
  if (first.status !== 200) { results.push({ klass: "repeat", text, status: first.status, state: `first:${first.status}`, ms: 0, expected: "queued", ok: false }); continue; }
  await say(c, { klass: "repeat", text });
}
const elapsedS = (performance.now() - started) / 1000;

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : 0; };
const byClass: Record<string, { n: number; published: number; queued: number; refused: number; falsePass: number; falseCatch: number; misses: string[] }> = {};
for (const r of results) {
  const b = byClass[r.klass] ??= { n: 0, published: 0, queued: 0, refused: 0, falsePass: 0, falseCatch: 0, misses: [] };
  b.n++;
  if (r.state === "published") b.published++; else if (r.state === "queued") b.queued++; else b.refused++;
  if (r.expected === "queued" && r.state === "published") { b.falsePass++; b.misses.push(r.text); }
  if (r.expected === "published" && r.state === "queued") { b.falseCatch++; b.misses.push(r.text); }
}
const timed = results.filter((r) => r.ms > 0).map((r) => r.ms);
const report = {
  node, phrases: results.length, elapsed_s: Math.round(elapsedS),
  published: results.filter((r) => r.state === "published").length,
  queued: results.filter((r) => r.state === "queued").length,
  refused: results.filter((r) => r.state.startsWith("refused") || r.state.startsWith("first")).length,
  false_pass: results.filter((r) => r.expected === "queued" && r.state === "published").length,
  false_catch: results.filter((r) => r.expected === "published" && r.state === "queued").length,
  verdict_ms: { p50: Math.round(pct(timed, 0.5)), p95: Math.round(pct(timed, 0.95)), max: Math.round(Math.max(...timed)), n: timed.length },
  verdict_ms_by_state: {
    published: { p50: Math.round(pct(results.filter((r) => r.state === "published").map((r) => r.ms), 0.5)), p95: Math.round(pct(results.filter((r) => r.state === "published").map((r) => r.ms), 0.95)) },
    queued: { p50: Math.round(pct(results.filter((r) => r.state === "queued").map((r) => r.ms), 0.5)), p95: Math.round(pct(results.filter((r) => r.state === "queued").map((r) => r.ms), 0.95)) },
  },
  by_class: byClass,
};
console.log(JSON.stringify(report, null, 2));
