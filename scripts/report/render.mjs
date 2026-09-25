// Print out/report.html to out/report.pdf with a footer.
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("file:///work/report.html", { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);
const stamp = process.env.STAMP;
await p.pdf({ path: "/work/report.pdf", format: "A4", printBackground: true, displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="font:8px Inter,sans-serif;color:#8a8984;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>Что есть и чего нет · ${stamp}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" } });
await b.close();
console.log("pdf ok");
