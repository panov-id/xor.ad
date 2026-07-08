// Branded "you're on the waitlist" email — brutalist / dark+gold, by PSYTICAN.
// Table-based, inline styles, no external assets (email-client safe).

type Lang = "en" | "ru";

const T: Record<Lang, {
  subject: string; preheader: string; hi: string; title: string;
  body: string[]; next: string; sign: string; why: string;
}> = {
  en: {
    subject: "You're on the list — Neighbro",
    preheader: "Good neighbors. Real moments. We'll tell you the moment your neighborhood opens.",
    hi: "Welcome",
    title: "You're on the list.",
    body: [
      "Neighbro is the art of being nearby — say something to the people around you right now, match, talk, and let it fade. No profile. No feed. No noise.",
      "You're one of the first. When your neighborhood opens, you'll be among the first to walk in.",
    ],
    next: "We'll email you the moment it's live.",
    sign: "— the Neighbro team",
    why: "You're getting this because you joined the Neighbro waitlist.",
  },
  ru: {
    subject: "Ты в списке — Neighbro",
    preheader: "Хорошие соседи. Живые моменты. Напишем, как только откроется твой район.",
    hi: "Добро пожаловать",
    title: "Ты в списке.",
    body: [
      "Neighbro — искусство быть рядом: скажи что-то людям вокруг прямо сейчас, совпади, поговори — и отпусти. Без профиля. Без ленты. Без шума.",
      "Ты среди первых. Когда откроется твой район — войдёшь одним из первых.",
    ],
    next: "Напишем на почту, как только всё заработает.",
    sign: "— команда Neighbro",
    why: "Ты получил это письмо, потому что записался в лист ожидания Neighbro.",
  },
};

const BG = "#0c0b09", PANEL = "#14120e", BORDER = "#3a331f";
const FG = "#ede8dd", MUTED = "#8a8172", ACCENT = "#c6a24e", INK = "#1a1509";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,monospace";

export function welcomeEmail(langRaw?: string): { subject: string; html: string; text: string } {
  const lang: Lang = langRaw === "ru" ? "ru" : "en";
  const t = T[lang];

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark">
<title>${t.subject}</title></head>
<body style="margin:0;padding:0;background:${BG};">
<span style="display:none!important;opacity:0;color:${BG};font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;">${t.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
 <tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${PANEL};border:1px solid ${BORDER};">
   <tr><td style="padding:26px 30px;border-bottom:1px solid ${BORDER};">
     <span style="font-family:${SANS};font-weight:800;font-size:18px;letter-spacing:1px;color:${FG};">NEIGHBRO</span>
     <span style="font-family:${MONO};font-size:11px;letter-spacing:2px;color:${MUTED};"> &nbsp;·&nbsp; BY <span style="color:${ACCENT};">PSYTICAN</span></span>
   </td></tr>
   <tr><td style="padding:34px 30px 8px;">
     <div style="font-family:${MONO};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${ACCENT};">${t.hi}</div>
     <h1 style="margin:14px 0 0;font-family:${SANS};font-weight:800;font-size:30px;line-height:1.1;color:${FG};text-transform:uppercase;">${t.title}</h1>
   </td></tr>
   <tr><td style="padding:18px 30px 6px;">
     ${t.body.map((p) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.55;color:${FG};">${p}</p>`).join("")}
   </td></tr>
   <tr><td style="padding:8px 30px 30px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
       <td style="border-left:3px solid ${ACCENT};padding:8px 0 8px 14px;font-family:${MONO};font-size:13px;letter-spacing:.5px;color:${MUTED};">${t.next}</td>
     </tr></table>
     <p style="margin:26px 0 0;font-family:${SANS};font-size:15px;color:${MUTED};">${t.sign}</p>
   </td></tr>
   <tr><td style="padding:18px 30px;border-top:1px solid ${BORDER};">
     <div style="font-family:${MONO};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${MUTED};line-height:1.7;">
       ${t.why}<br>© 2026 Neighbro.place · by <span style="color:${ACCENT};">PSYTICAN</span>
     </div>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;

  const text = `${t.title}\n\n${t.body.join("\n\n")}\n\n${t.next}\n${t.sign}\n\n${t.why}\n© 2026 Neighbro.place · by PSYTICAN`;
  return { subject: t.subject, html, text };
}
