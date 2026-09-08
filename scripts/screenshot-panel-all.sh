#!/usr/bin/env bash
# Every page of the panel, in both themes, at a desktop width and at 390 px —
# and a horizontal-overflow check on each, because a screenshot nobody measures
# only proves that something rendered.
#
# The log-page screenshotter (screenshot-panel-logs.sh) shoots four of these at
# one width for a closer look at the tables; this one is the sweep.
#
# Prerequisites:
#   relay/local/docker-compose.yml   up   (relay  -> :62080)
#   a panel dev server                    (PANEL_URL, default :62173)
#
# Output: testing/screenshots/sweep/<page>-<theme>-<width>.png
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deno_image="denoland/deno:alpine-2.1.4"
playwright_image="panel-tests-runner"
panel_url="${PANEL_URL:-http://localhost:62173}"
secret="local-panel-secret"   # matches relay/local/docker-compose.yml
# The token also names the environment, and the node refuses one minted for
# another (tools/mint_panel_token.ts). Without this the mint takes the default
# name, every request answers 401, and the sweep quietly photographs the login
# page instead of the panel — which is exactly what it did on 2026-09-08.
env_name="local"                # matches NODE_ENV_NAME on the stand

out="$root/testing/screenshots/sweep"
mkdir -p "$out"

echo "== building the Playwright runner (panel/tests image)"
docker build -q -t "$playwright_image" "$root/panel/tests" >/dev/null

echo "== minting an admin session for the stand"
token="$(docker run --rm -e SESSION_SECRET="$secret" -e NODE_ENV_NAME="$env_name" \
  -v "$root/relay/node":/node -w /node \
  "$deno_image" deno run --allow-env tools/mint_panel_token.ts admin admin@local.test 2>/dev/null | tail -1)"

# A sweep that photographs the login page proves nothing and looks fine, so the
# session is checked once, here, before forty-four screenshots are taken.
me_status="$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $token" \
  "${RELAY_URL:-http://localhost:62080}/auth/me")"
[ "$me_status" = "200" ] || {
  echo "the minted session is not accepted by the stand (/auth/me -> $me_status)." >&2
  echo "check SESSION_SECRET and NODE_ENV_NAME against relay/local/docker-compose.yml" >&2
  exit 1
}

script_dir="$(mktemp -d)"
trap 'rm -rf "$script_dir"' EXIT

cat > "$script_dir/sweep.mjs" <<'JS'
import { chromium } from "@playwright/test";

const panelUrl = process.env.PANEL_URL;
const token = process.env.PANEL_TOKEN;

const PAGES = [
  { path: "/waitlist", name: "waitlist" },
  { path: "/panel-users", name: "panel-users" },
  { path: "/logs/client-errors", name: "logs-client-errors" },
  { path: "/logs/audit", name: "logs-audit" },
  { path: "/logs/server", name: "logs-server" },
  { path: "/logs/pageviews", name: "logs-pageviews" },
  { path: "/api-keys", name: "api-keys" },
  { path: "/secret-keys", name: "secret-keys" },
  { path: "/brands", name: "brands" },
  // The Article 16 queue. It was missing from this sweep while the page itself
  // existed, so nobody ever looked at it here — and on 2026-09-08 that showed:
  // a notice held by the platform rendered its queue cell as an empty badge.
  { path: "/dsa-notices", name: "dsa-notices" },
  // No session for this one: a login page shot while signed in redirects away.
  { path: "/login", name: "login", anonymous: true },
];

const THEMES = ["light", "dark"];
const WIDTHS = [
  { label: "desktop", width: 1280, height: 900 },
  { label: "390", width: 390, height: 844 },
];

const browser = await chromium.launch();
let overflowing = 0;
let shot = 0;

for (const theme of THEMES) {
  for (const size of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
    });
    // Both are read before the first render, so they are planted as an init
    // script rather than set after navigation.
    await context.addInitScript(
      ([jwt, chosen]) => {
        if (jwt) localStorage.setItem("panel_jwt", jwt);
        else localStorage.removeItem("panel_jwt");
        localStorage.setItem("panel_theme", chosen);
      },
      [token, theme],
    );
    const page = await context.newPage();

    for (const target of PAGES) {
      if (target.anonymous) {
        await page.addInitScript(() => localStorage.removeItem("panel_jwt"));
      }
      await page.goto(`${panelUrl}${target.path}`, { waitUntil: "networkidle" });
      // The pages fetch after mount; give the table a moment to fill in.
      await page.waitForTimeout(1200);

      const file = `${target.name}-${theme}-${size.label}.png`;
      await page.screenshot({ path: `/screenshots/${file}`, fullPage: true });
      shot++;

      // The page body must never scroll sideways: a table scrolls inside its
      // card instead. 1px of tolerance for sub-pixel rounding.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const theme_applied = await page.evaluate(
        () => document.documentElement.getAttribute("data-theme"),
      );
      const bad = overflow > 1;
      if (bad) overflowing++;
      console.log(
        `   ${bad ? "OVERFLOW" : "ok      "} ${String(overflow).padStart(4)}px  ${file}` +
          (theme_applied === theme ? "" : `  [theme=${theme_applied ?? "none"}!]`),
      );
    }
    await context.close();
  }
}

await browser.close();
console.log(`\n${shot} screenshots, ${overflowing} page(s) scrolling sideways`);
process.exit(overflowing === 0 ? 0 : 1);
JS

echo "== sweeping"
docker run --rm --network host \
  -e PANEL_URL="$panel_url" \
  -e PANEL_TOKEN="$token" \
  -u "$(id -u):$(id -g)" \
  -v "$script_dir/sweep.mjs":/tests/sweep.mjs \
  -v "$out":/screenshots \
  -w /tests \
  --entrypoint node \
  "$playwright_image" \
  sweep.mjs

echo
echo "Screenshots in testing/screenshots/sweep/"
