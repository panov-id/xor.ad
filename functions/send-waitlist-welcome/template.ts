// Branded "you're on the waitlist" email — brutalist, in the visitor's language
// and their chosen colour theme (accent + light/dark), matching the landing.
// Table-based, inline styles, no external assets (email-client safe).

type Lang = "en" | "ru" | "fr" | "de" | "es" | "el";

const T: Record<Lang, {
  subject: string; preheader: string; hi: string; title: string;
  body: string[]; next: string; sign: string; why: string;
}> = {
  en: {
    subject: "You're on the list — Neighbro",
    preheader: "Good neighbors. Real moments. We'll tell you the moment your neighborhood opens.",
    hi: "Welcome", title: "You're on the list.",
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
    hi: "Добро пожаловать", title: "Ты в списке.",
    body: [
      "Neighbro — искусство быть рядом: скажи что-то людям вокруг прямо сейчас, совпади, поговори — и отпусти. Без профиля. Без ленты. Без шума.",
      "Ты среди первых. Когда откроется твой район — войдёшь одним из первых.",
    ],
    next: "Напишем на почту, как только всё заработает.",
    sign: "— команда Neighbro",
    why: "Ты получил это письмо, потому что записался в лист ожидания Neighbro.",
  },
  fr: {
    subject: "Tu es sur la liste — Neighbro",
    preheader: "Bons voisins. De vrais moments. On te prévient dès que ton quartier ouvre.",
    hi: "Bienvenue", title: "Tu es sur la liste.",
    body: [
      "Neighbro, c'est l'art d'être tout près — dis un mot aux gens autour de toi maintenant, matche, parle, puis laisse ça s'effacer. Pas de profil. Pas de fil. Pas de bruit.",
      "Tu es parmi les premiers. Quand ton quartier ouvrira, tu seras parmi les premiers à entrer.",
    ],
    next: "On t'écrit dès que c'est en ligne.",
    sign: "— l'équipe Neighbro",
    why: "Tu reçois ceci car tu as rejoint la liste d'attente Neighbro.",
  },
  de: {
    subject: "Du bist auf der Liste — Neighbro",
    preheader: "Gute Nachbarn. Echte Momente. Wir sagen Bescheid, sobald deine Nachbarschaft öffnet.",
    hi: "Willkommen", title: "Du bist auf der Liste.",
    body: [
      "Neighbro ist die Kunst, nah zu sein — sag jetzt etwas zu den Menschen um dich herum, matche, rede und lass es verblassen. Kein Profil. Kein Feed. Kein Lärm.",
      "Du bist unter den Ersten. Wenn deine Nachbarschaft öffnet, bist du unter den Ersten, die eintreten.",
    ],
    next: "Wir mailen dir, sobald es live ist.",
    sign: "— das Neighbro-Team",
    why: "Du erhältst dies, weil du der Neighbro-Warteliste beigetreten bist.",
  },
  es: {
    subject: "Estás en la lista — Neighbro",
    preheader: "Buenos vecinos. Momentos reales. Te avisamos en cuanto abra tu vecindario.",
    hi: "Bienvenido", title: "Estás en la lista.",
    body: [
      "Neighbro es el arte de estar cerca: di algo a la gente a tu alrededor ahora, haz match, habla y deja que se desvanezca. Sin perfil. Sin feed. Sin ruido.",
      "Eres de los primeros. Cuando abra tu vecindario, estarás entre los primeros en entrar.",
    ],
    next: "Te escribiremos en cuanto esté disponible.",
    sign: "— el equipo de Neighbro",
    why: "Recibes esto porque te uniste a la lista de espera de Neighbro.",
  },
  el: {
    subject: "Είσαι στη λίστα — Neighbro",
    preheader: "Καλοί γείτονες. Αληθινές στιγμές. Θα σου πούμε μόλις ανοίξει η γειτονιά σου.",
    hi: "Καλωσόρισες", title: "Είσαι στη λίστα.",
    body: [
      "Το Neighbro είναι η τέχνη του να είσαι κοντά — πες κάτι στους ανθρώπους γύρω σου τώρα, ταίριαξε, μίλα και άφησέ το να σβήσει. Χωρίς προφίλ. Χωρίς ροή. Χωρίς θόρυβο.",
      "Είσαι από τους πρώτους. Όταν ανοίξει η γειτονιά σου, θα είσαι από τους πρώτους που θα μπουν.",
    ],
    next: "Θα σου στείλουμε email μόλις είναι έτοιμο.",
    sign: "— η ομάδα του Neighbro",
    why: "Λαμβάνεις αυτό επειδή μπήκες στη λίστα αναμονής του Neighbro.",
  },
};

// Accents mirror the landing's curated subset (accent + ink-on-accent).
const ACCENTS: Record<string, { accent: string; ink: string }> = {
  "": { accent: "#c6a24e", ink: "#1a1509" },        // gold (default)
  gold: { accent: "#c6a24e", ink: "#1a1509" },
  crimson: { accent: "#e0342b", ink: "#fdeceb" },
  teal: { accent: "#1fb39a", ink: "#04201c" },
  azure: { accent: "#3d84d6", ink: "#eaf2ff" },
  violet: { accent: "#9b5de5", ink: "#f3ecfd" },
};
const DARK = { bg: "#0c0b09", panel: "#14120e", border: "#3a331f", fg: "#ede8dd", muted: "#8a8172" };
const LIGHT = { bg: "#e9e6dd", panel: "#f4f1e8", border: "#1e1b14", fg: "#181510", muted: "#5f5a4e" };

const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,monospace";

export function welcomeEmail(
  langRaw?: string, accentRaw?: string, modeRaw?: string,
): { subject: string; html: string; text: string } {
  const lang: Lang = (["en", "ru", "fr", "de", "es", "el"].includes(langRaw ?? "") ? langRaw : "en") as Lang;
  const t = T[lang];
  const a = ACCENTS[accentRaw ?? ""] ?? ACCENTS[""];
  const c = modeRaw === "light" ? LIGHT : DARK;
  const ACCENT = a.accent, INK = a.ink;

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${modeRaw === "light" ? "light" : "dark"}">
<title>${t.subject}</title></head>
<body style="margin:0;padding:0;background:${c.bg};">
<span style="display:none!important;opacity:0;color:${c.bg};font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;">${t.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};">
 <tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${c.panel};border:1px solid ${c.border};">
   <tr><td style="padding:26px 30px;border-bottom:1px solid ${c.border};">
     <span style="font-family:${SANS};font-weight:800;font-size:18px;letter-spacing:1px;color:${c.fg};">NEIGHBRO</span>
     <span style="font-family:${MONO};font-size:11px;letter-spacing:2px;color:${c.muted};"> &nbsp;·&nbsp; BY <span style="color:${ACCENT};">PSYTICAN</span></span>
   </td></tr>
   <tr><td style="padding:34px 30px 8px;">
     <div style="font-family:${MONO};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${ACCENT};">${t.hi}</div>
     <h1 style="margin:14px 0 0;font-family:${SANS};font-weight:800;font-size:30px;line-height:1.1;color:${c.fg};text-transform:uppercase;">${t.title}</h1>
   </td></tr>
   <tr><td style="padding:18px 30px 6px;">
     ${t.body.map((p) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.55;color:${c.fg};">${p}</p>`).join("")}
   </td></tr>
   <tr><td style="padding:8px 30px 30px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
       <td style="border-left:3px solid ${ACCENT};padding:8px 0 8px 14px;font-family:${MONO};font-size:13px;letter-spacing:.5px;color:${c.muted};">${t.next}</td>
     </tr></table>
     <p style="margin:26px 0 0;font-family:${SANS};font-size:15px;color:${c.muted};">${t.sign}</p>
   </td></tr>
   <tr><td style="padding:18px 30px;border-top:1px solid ${c.border};">
     <div style="font-family:${MONO};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${c.muted};line-height:1.7;">
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
