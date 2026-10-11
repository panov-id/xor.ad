// The tab's icon is the storefront's mark (owner 11.10.2026: «use the logos we drew»; sheets
// panel/design/adaptive-*-marks.svg, size 16). Drawn here from the theme's own colours as the browser
// resolved them, so it follows the accent the person chose and the page names no colour of its own.
import { BRAND } from "./config.ts";

function resolved(name: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

export function setFavicon(): void {
  const accent = resolved("--accent");
  const ink = resolved("--accent-fg");
  const svg = BRAND === "neighbro"
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2 L21 9.5 V18.5 H11 L6.5 22.5 V18.5 H3 V9.5 Z" fill="${accent}"/><path d="M16 5.5 V2.5 H18.5 V7.5" fill="${accent}"/><rect x="7.5" y="11" width="6" height="2" rx="1" fill="${ink}"/><rect x="7.5" y="14.5" width="9" height="2" rx="1" fill="${ink}"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11.5" fill="${accent}"/><path d="M5 8 H19 V16.5 H10.5 L7 19.5 V16.5 H5 Z" fill="${ink}"/><path d="M15 8 V4.5 M13.2 5 L16.8 4" stroke="${ink}" stroke-width="1.4" stroke-linecap="round"/>${[7.2, 10.8, 14.4].map((x) => [10, 13].map((y) => `<rect x="${x}" y="${y}" width="2.2" height="2" fill="${accent}"/>`).join("")).join("")}</svg>`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
