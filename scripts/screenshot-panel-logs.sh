#!/usr/bin/env bash
# Screenshots of the panel's log pages against the local stand, using the same
# Playwright image the e2e suite runs on. Independent of that suite: it only
# needs the panel dev server and the relay stand, no Supabase.
#
# Prerequisites:
#   relay/local/docker-compose.yml   up   (relay  -> :8081)
#   scripts/run-panel-dev-local.sh   up   (panel  -> :5174)
#
# Output: testing/screenshots/panel-*.png
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deno_image="denoland/deno:alpine-2.1.4"
# The base Playwright image ships browsers but not the npm package; the panel's
# own test image adds it, so that one is reused here.
playwright_image="panel-tests-runner"
panel_url="${PANEL_URL:-http://localhost:5174}"
secret="local-panel-secret"   # matches relay/local/docker-compose.yml

mkdir -p "$root/testing/screenshots"

echo "== building the Playwright runner (panel/tests image)"
docker build -q -t "$playwright_image" "$root/panel/tests" >/dev/null

echo "== minting an admin session for the stand"
token="$(docker run --rm -e SESSION_SECRET="$secret" -v "$root/relay/node":/node -w /node \
  "$deno_image" deno run --allow-env tools/mint_panel_token.ts admin admin@local.test 2>/dev/null | tail -1)"

script_dir="$(mktemp -d)"
trap 'rm -rf "$script_dir"' EXIT

cat > "$script_dir/shoot.mjs" <<'JS'
// Loads the panel with a pre-seeded session and shoots each page full-height.
import { chromium } from "@playwright/test";

const panelUrl = process.env.PANEL_URL;
const token = process.env.PANEL_TOKEN;

const PAGES = [
  { path: "/logs/pageviews", file: "panel-logs-pageviews.png" },
  { path: "/logs/client-errors", file: "panel-logs-client-errors.png" },
  { path: "/logs/audit", file: "panel-logs-audit.png" },
  { path: "/logs/server", file: "panel-logs-server.png" },
  { path: "/waitlist", file: "panel-waitlist.png" },
  { path: "/panel-users", file: "panel-users.png" },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// The panel reads its session from localStorage before the first render, so the
// token is planted as an init script rather than after navigation.
await context.addInitScript((value) => localStorage.setItem("panel_jwt", value), token);
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") console.log(`   [console error] ${message.text()}`);
});
page.on("requestfailed", (request) =>
  console.log(`   [request failed] ${request.method()} ${request.url()}`)
);

for (const target of PAGES) {
  await page.goto(`${panelUrl}${target.path}`, { waitUntil: "networkidle" });
  // The log pages fetch after mount; give the table a moment to fill in.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/screenshots/${target.file}`, fullPage: true });
  const heading = await page.locator("h1").first().textContent().catch(() => null);
  const rows = await page.locator("table.panel-table tbody tr").count().catch(() => 0);
  console.log(`   ${target.path} -> ${target.file}  h1="${heading ?? "-"}" rows=${rows}`);
}

// One expanded row, to show the detail pane.
await page.goto(`${panelUrl}/logs/audit`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const firstRow = page.locator("table.panel-table tbody tr.log-row").first();
if (await firstRow.count()) {
  await firstRow.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/screenshots/panel-logs-audit-expanded.png", fullPage: true });
  console.log("   /logs/audit (row expanded) -> panel-logs-audit-expanded.png");
}

await browser.close();
JS

echo "== shooting"
docker run --rm --network host \
  -e PANEL_URL="$panel_url" \
  -e PANEL_TOKEN="$token" \
  -u "$(id -u):$(id -g)" \
  -v "$script_dir/shoot.mjs":/tests/shoot.mjs \
  -v "$root/testing/screenshots":/screenshots \
  -w /tests \
  --entrypoint node \
  "$playwright_image" \
  shoot.mjs

echo
echo "Screenshots in testing/screenshots/"
ls -1 "$root/testing/screenshots" | grep '^panel-' || true
