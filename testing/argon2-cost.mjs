// Сколько стоит Argon2id во вкладке — замер, а не допущение.
//
// §8.2 спеки задаёт 64 МБ и t=3 и для ПИНа, и для бумажного кода, и эти числа
// никогда не проверялись: WebCrypto Argon2id не умеет вовсе, это WASM, и цена
// ошибки здесь уникальна — параметры входят в вывод ключа КАЖДОГО устройства,
// поэтому сменить их после запуска значит разом обнулить все доли хранилища и
// все бумажные коды, то есть стереть локальные истории у всех.
//
// Меряем две точки: заявленную (64 МБ) и запасную (32 МБ), в трёх движках.
// Телефон это не заменяет — ноутбук быстрее, — но отвечает на главный вопрос:
// работает ли вообще и не падает ли вкладка по памяти.
import { chromium, firefox, webkit } from "playwright";

const LIBRARY = "https://cdn.jsdelivr.net/npm/hash-wasm@4.11.0/dist/argon2.umd.min.js";

const PROBE = async (url) => {
  const out = { points: [] };
  await new Promise((done, fail) => {
    const tag = document.createElement("script");
    tag.src = url;
    tag.onload = done;
    tag.onerror = () => fail(new Error("библиотека не загрузилась"));
    document.head.appendChild(tag);
  });

  const salt = new Uint8Array(16).fill(7);
  for (const memory of [65536, 32768]) {
    const started = performance.now();
    let failure = null;
    try {
      await hashwasm.argon2id({
        password: "123456", salt, parallelism: 1,
        iterations: 3, memorySize: memory, hashLength: 64, outputType: "binary",
      });
    } catch (error) {
      failure = String((error && error.message) || error).slice(0, 80);
    }
    out.points.push({
      memoryMiB: memory / 1024,
      ms: Math.round(performance.now() - started),
      failure,
    });
  }
  return out;
};

const engines = { chromium, firefox, webkit };
const report = {};
for (const [name, engine] of Object.entries(engines)) {
  let browser;
  try {
    browser = await engine.launch();
    const page = await browser.newPage();
    await page.goto("https://example.com");   // нужен обычный origin, не about:blank
    report[name] = await page.evaluate(PROBE, LIBRARY);
  } catch (error) {
    report[name] = { error: String((error && error.message) || error).slice(0, 120) };
  } finally {
    if (browser) await browser.close();
  }
}
console.log(JSON.stringify(report, null, 2));
