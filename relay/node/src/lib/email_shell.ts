// The visual identity our email shares, and a shell for the letters that are not
// the welcome one.
//
// Two kinds of letter live here, and they are deliberately not one template. The
// welcome letter invites: it carries the landing's hero, offers the reader's own
// colour theme, and speaks sixteen languages. The letters below inform — a report
// received, a decision taken, a sign-in link — and a banner over "why your content
// was restricted" would be a misjudgement of what the letter is for.
//
// What they do share is the identity: the palettes, the type, the wordmark, the
// footer. Those lived inside welcome.ts, which made them unusable anywhere else,
// so the operational letters went out as `<p>line<br>line</p>` — text in a
// paragraph, and it looked like it.
//
// The other reason to keep the shells apart is remote images. The welcome letter
// loads a hero from the brand's CDN, which is a request from the reader's mail
// client to us. In a letter that answers a notice about illegal content, that
// request would tell us when they opened it — a thing we have no business
// learning from a legal notice.

import type { Brand } from "../config.ts";

type Accent = { accent: string; ink: string };
type ModeColors = { bg: string; panel: string; border: string; fg: string; muted: string };
export type BrandStyle = {
  accents: Record<string, Accent>;
  defaultAccent: string;
  dark: ModeColors;
  light: ModeColors;
  radius: string; // border-radius for the outer card
  borderWidth: string; // card border thickness
  heroPath: string; // header image path on the brand's landing CDN (welcome only)
};

// Per-brand visual identity, mirroring each landing's palette and shape language:
// neighbro is brutalist (sharp corners, thick borders), sosed is warm and rounded
// (radius, thin borders). Keyed by brand key; unknown brands fall back to the
// first entry's style via brandStyle().
export const STYLES: Record<string, BrandStyle> = {
  neighbro: {
    accents: {
      gold: { accent: "#c6a24e", ink: "#1a1509" },
      crimson: { accent: "#e0342b", ink: "#fdeceb" },
      teal: { accent: "#1fb39a", ink: "#04201c" },
      azure: { accent: "#3d84d6", ink: "#eaf2ff" },
      violet: { accent: "#9b5de5", ink: "#f3ecfd" },
    },
    defaultAccent: "gold",
    dark: { bg: "#0c0b09", panel: "#14120e", border: "#3a331f", fg: "#ede8dd", muted: "#8a8172" },
    light: { bg: "#e9e6dd", panel: "#f4f1e8", border: "#1e1b14", fg: "#181510", muted: "#5f5a4e" },
    radius: "0",
    borderWidth: "2px",
    heroPath: "img/hero.jpg",
  },
  sosed: {
    accents: {
      terra: { accent: "#d6552f", ink: "#fff6f0" },
      amber: { accent: "#d68a1f", ink: "#241206" },
      teal: { accent: "#1fa99a", ink: "#04231f" },
      azure: { accent: "#3d84d6", ink: "#eaf2ff" },
      violet: { accent: "#9b5de5", ink: "#f3ecfd" },
      crimson: { accent: "#e0342b", ink: "#fdeceb" },
    },
    defaultAccent: "terra",
    dark: { bg: "#0d0b0a", panel: "#17130f", border: "#3a2e20", fg: "#f0e7dc", muted: "#9a8d7c" },
    light: { bg: "#ece4d8", panel: "#f5efe4", border: "#221a12", fg: "#1c140d", muted: "#6b5f4c" },
    radius: "14px",
    borderWidth: "1px",
    heroPath: "img/splash.jpg", // evening courtyard — warmer than the flat facade
  },
};

export function brandStyle(key: string): BrandStyle {
  return STYLES[key] ?? Object.values(STYLES)[0];
}

export const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
export const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,monospace";

// A line of an operational letter, tagged with what it is rather than how it
// looks. The plain-text version reads the same tags, so the two cannot drift into
// saying different things — which is the failure that matters here: the text part
// is what a screen reader and a stripped-down client will show, and under Article
// 17(3) it has to carry the whole statement on its own.
export type Block =
  | { kind: "text"; value: string }
  | { kind: "heading"; value: string }
  | { kind: "quote"; value: string } // the reader's own words, or a reason given
  | { kind: "reference"; value: string }; // an id, monospaced and selectable

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function letter(opts: {
  brand: Brand;
  title: string;
  blocks: Block[];
  footnote?: string;
}): { html: string; text: string } {
  const style = brandStyle(opts.brand.key);
  const accent = style.accents[style.defaultAccent].accent;
  const colors = style.dark;
  const domain = opts.brand.domain;

  const body = opts.blocks.map((block) => {
    switch (block.kind) {
      case "heading":
        return `<div style="margin:22px 0 8px;font-family:${MONO};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${accent};">${
          escape(block.value)
        }</div>`;
      case "quote":
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border-left:3px solid ${accent};padding:6px 0 6px 14px;font-family:${SANS};font-size:15px;line-height:1.5;color:${colors.fg};">${
          escape(block.value)
        }</td></tr></table>`;
      case "reference":
        return `<p style="margin:0 0 16px;font-family:${MONO};font-size:13px;letter-spacing:.5px;color:${colors.muted};">${
          escape(block.value)
        }</p>`;
      default:
        return `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.55;color:${colors.fg};">${
          escape(block.value)
        }</p>`;
    }
  }).join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark">
<title>${escape(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${colors.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg};">
 <tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${colors.panel};border:${style.borderWidth} solid ${colors.border};border-radius:${style.radius};overflow:hidden;">
   <tr><td style="padding:22px 30px;border-bottom:3px solid ${accent};">
     <span style="font-family:${SANS};font-weight:800;font-size:18px;letter-spacing:1px;color:${colors.fg};">${
    escape(opts.brand.upper)
  }</span>
   </td></tr>
   <tr><td style="padding:30px 30px 6px;">
     <h1 style="margin:0;font-family:${SANS};font-weight:800;font-size:24px;line-height:1.15;color:${colors.fg};">${
    escape(opts.title)
  }</h1>
   </td></tr>
   <tr><td style="padding:18px 30px 24px;">${body}</td></tr>
   <tr><td style="padding:18px 30px;border-top:1px solid ${colors.border};">
     <div style="font-family:${MONO};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${colors.muted};line-height:1.7;">
       ${escape(opts.footnote ?? "This message was sent because of a report you filed or received.")}<br>© 2026 ${
    escape(domain)
  } · by <span style="color:${accent};">PSYTICAN</span>
     </div>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;

  // The same content, carrying the same weight without any styling. Headings keep
  // their emphasis by shape rather than colour; a quote keeps its indent.
  const text = [
    opts.title,
    "",
    ...opts.blocks.flatMap((block) => {
      switch (block.kind) {
        case "heading":
          return [block.value.toUpperCase(), ""];
        case "quote":
          return [`  ${block.value}`, ""];
        default:
          return [block.value, ""];
      }
    }),
    opts.footnote ?? "This message was sent because of a report you filed or received.",
    `© 2026 ${domain} · by PSYTICAN`,
  ].join("\n");

  return { html, text };
}
