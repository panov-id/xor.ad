// D3: prove that nothing reaches a Google domain before consent — and that the
// probe could see it if it did.
//
// The second half is the point. "Zero requests to Google" is trivially true on a
// site with no analytics id configured, on a page that failed to load, or with a
// probe that watches the wrong thing. So every site is also driven through the
// accept button, and the run fails if the requests do NOT appear afterwards:
// a check that cannot go red is decoration.
import { chromium } from "@playwright/test";

const GOOGLE = /(^|\.)(google|googletagmanager|google-analytics|googleapis|gstatic|doubleclick|youtube)\./i;

const SITES = [
  { host: "https://neighbro.place", consentKey: "nb-consent" },
  { host: "https://sosed.place", consentKey: "nb-consent" },
];
const PAGES = ["/", "/ru/", "/legal.html", "/rules.html", "/report.html"];

const browser = await chromium.launch();
let failures = 0;

function isGoogle(url) {
  try {
    return GOOGLE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// --- half one: nothing before consent ---------------------------------------
for (const site of SITES) {
  console.log(`\n=== ${site.host} — до согласия`);
  for (const path of PAGES) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requested = [];
    const violations = [];
    page.on("request", (request) => requested.push(request.url()));
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
    });

    let status = 0;
    try {
      const response = await page.goto(site.host + path, { waitUntil: "networkidle", timeout: 45000 });
      status = response ? response.status() : 0;
    } catch (error) {
      console.log(`  ✗ ${path} — не загрузилась: ${error.message.split("\n")[0]}`);
      failures++;
      await context.close();
      continue;
    }
    // The banner decides after load; give any late script its chance to fire.
    await page.waitForTimeout(2500);

    const google = requested.filter(isGoogle);
    const bannerVisible = await page.locator("#consentAccept").isVisible().catch(() => false);

    const bad = google.length > 0;
    if (bad) failures++;
    console.log(
      `  ${bad ? "✗" : "✓"} ${path.padEnd(14)} ${status}  запросов ${String(requested.length).padStart(3)}` +
        `  к Google: ${google.length}  баннер: ${bannerVisible ? "виден" : "нет"}` +
        (violations.length ? `  CSP-нарушений: ${violations.length}` : ""),
    );
    for (const url of google.slice(0, 5)) console.log(`      ${url}`);
    for (const text of violations.slice(0, 3)) console.log(`      CSP: ${text.slice(0, 120)}`);
    await context.close();
  }
}

// --- half two: the probe can see them at all --------------------------------
console.log(`\n=== положительный контроль: после «принять» запросы ОБЯЗАНЫ появиться`);
for (const site of SITES) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requested = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.goto(site.host + "/", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1500);

  const before = requested.filter(isGoogle).length;
  const accept = page.locator("#consentAccept");
  if (!(await accept.isVisible().catch(() => false))) {
    console.log(`  ✗ ${site.host} — кнопки согласия нет, контроль невозможен`);
    failures++;
    await context.close();
    continue;
  }
  await accept.click();
  await page.waitForTimeout(4000);

  const after = requested.filter(isGoogle);
  const appeared = after.length > before;
  if (!appeared) failures++;
  console.log(
    `  ${appeared ? "✓" : "✗"} ${site.host}  до: ${before}  после: ${after.length}` +
      (appeared ? "" : "  — проверка не смогла бы покраснеть, значит ничего не доказывает"),
  );
  for (const url of after.slice(0, 3)) console.log(`      ${url}`);
  await context.close();
}

await browser.close();
console.log(failures === 0 ? "\nвсё сошлось" : `\nпровалов: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
