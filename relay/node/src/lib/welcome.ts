// Branded "you're on the waitlist" email — ported from the Supabase Edge
// Function send-waitlist-welcome. Brutalist, in the visitor's language + chosen
// colour theme (accent + light/dark). Table-based, inline styles, no external
// assets (email-client safe). One node serves all faces; the brand name + domain
// + sender come from the brand registry (config.brands) — extensible to N brands.
//
// All 16 landing languages are covered; any unknown code falls back to en.

import { config, type Brand } from "../config.ts";

type Lang =
  | "en" | "ru" | "fr" | "de" | "es" | "el" | "uk" | "be" | "kk" | "ka"
  | "hy" | "az" | "uz" | "ky" | "tg" | "ro";

// Pick the brand from a hint (the signup source, or a Host) against each brand's
// `match` list; falls back to the first (primary) brand.
export function resolveBrand(hint: string | null): Brand {
  const h = (hint ?? "").toLowerCase();
  return config.brands.find((b) => b.match.some((m) => h.includes(m.toLowerCase())))
    ?? config.brands[0];
}

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
  uk: {
    subject: "Ти у списку — Neighbro",
    preheader: "Хороші сусіди. Живі моменти. Напишемо, щойно відкриється твій район.",
    hi: "Ласкаво просимо", title: "Ти у списку.",
    body: [
      "Neighbro — мистецтво бути поруч: скажи щось людям навколо просто зараз, збігнись, поговори — і відпусти. Без профілю. Без стрічки. Без шуму.",
      "Ти серед перших. Коли відкриється твій район — увійдеш одним із перших.",
    ],
    next: "Напишемо на пошту, щойно все запрацює.",
    sign: "— команда Neighbro",
    why: "Ти отримав цей лист, бо записався до списку очікування Neighbro.",
  },
  be: {
    subject: "Ты ў спісе — Neighbro",
    preheader: "Добрыя суседзі. Жывыя моманты. Напішам, як толькі адкрыецца твой раён.",
    hi: "Сардэчна запрашаем", title: "Ты ў спісе.",
    body: [
      "Neighbro — мастацтва быць побач: скажы нешта людзям вакол проста зараз, супадзі, пагавары — і адпусці. Без профілю. Без стужкі. Без шуму.",
      "Ты сярод першых. Калі адкрыецца твой раён — увойдзеш адным з першых.",
    ],
    next: "Напішам на пошту, як толькі ўсё запрацуе.",
    sign: "— каманда Neighbro",
    why: "Ты атрымаў гэты ліст, бо запісаўся ў спіс чакання Neighbro.",
  },
  kk: {
    subject: "Сен тізімдесің — Neighbro",
    preheader: "Жақсы көршілер. Нағыз сәттер. Ауданың ашылған сәтте хабарлаймыз.",
    hi: "Қош келдің", title: "Сен тізімдесің.",
    body: [
      "Neighbro — жақын болу өнері: дәл қазір айналаңдағы адамдарға бірдеңе айт, сәйкес кел, сөйлес — содан кейін жібер. Профильсіз. Таспасыз. Шусыз.",
      "Сен алғашқылардың бірісің. Ауданың ашылғанда, алғашқылардың бірі болып кіресің.",
    ],
    next: "Іске қосылған сәтте поштаңа жазамыз.",
    sign: "— Neighbro командасы",
    why: "Бұл хатты Neighbro күту тізіміне жазылғаның үшін алдың.",
  },
  ka: {
    subject: "სიაში ხარ — Neighbro",
    preheader: "კარგი მეზობლები. ნამდვილი მომენტები. შეგატყობინებთ, როგორც კი შენი უბანი გაიხსნება.",
    hi: "კეთილი იყოს შენი მობრძანება", title: "სიაში ხარ.",
    body: [
      "Neighbro არის ახლოს ყოფნის ხელოვნება — უთხარი რაღაც შენ გარშემო მყოფ ხალხს ახლავე, დაემთხვიე, ისაუბრე და გააქრე. პროფილის გარეშე. ფიდის გარეშე. ხმაურის გარეშე.",
      "შენ პირველთა შორის ხარ. როცა შენი უბანი გაიხსნება, პირველთა შორის შეხვალ.",
    ],
    next: "მოგწერთ, როგორც კი ამოქმედდება.",
    sign: "— Neighbro-ს გუნდი",
    why: "ამ წერილს იღებ, რადგან Neighbro-ს მოლოდინის სიას შეუერთდი.",
  },
  hy: {
    subject: "Դու ցուցակում ես — Neighbro",
    preheader: "Լավ հարևաններ։ Իրական պահեր։ Կգրենք հենց որ քո թաղը բացվի։",
    hi: "Բարի գալուստ", title: "Դու ցուցակում ես։",
    body: [
      "Neighbro-ն մոտ լինելու արվեստն է — ասա մի բան շուրջդ գտնվող մարդկանց հենց հիմա, համընկիր, խոսիր և թող որ չքանա։ Առանց պրոֆիլի։ Առանց հոսքի։ Առանց աղմուկի։",
      "Դու առաջիններից ես։ Երբ քո թաղը բացվի, առաջիններից կլինես, որ ներս կմտնես։",
    ],
    next: "Կգրենք փոստիդ հենց որ գործարկվի։",
    sign: "— Neighbro-ի թիմը",
    why: "Ստանում ես սա, որովհետև միացել ես Neighbro-ի սպասման ցուցակին։",
  },
  az: {
    subject: "Siyahıdasan — Neighbro",
    preheader: "Yaxşı qonşular. Əsl anlar. Məhəllən açılan kimi xəbər verəcəyik.",
    hi: "Xoş gəldin", title: "Siyahıdasan.",
    body: [
      "Neighbro yaxın olmaq sənətidir — indi ətrafındakı insanlara bir söz de, uyğun gəl, danış və qoy əriyib getsin. Profil yoxdur. Lent yoxdur. Səs-küy yoxdur.",
      "Sən ilklərdənsən. Məhəllən açılanda, ilk girənlərdən biri olacaqsan.",
    ],
    next: "İşə düşən kimi poçtuna yazacağıq.",
    sign: "— Neighbro komandası",
    why: "Bunu alırsan, çünki Neighbro gözləmə siyahısına qoşulmusan.",
  },
  uz: {
    subject: "Roʻyxatdasan — Neighbro",
    preheader: "Yaxshi qoʻshnilar. Haqiqiy lahzalar. Mahallang ochilishi bilan xabar beramiz.",
    hi: "Xush kelibsan", title: "Roʻyxatdasan.",
    body: [
      "Neighbro — yaqin boʻlish sanʼati: hozir atrofingdagi odamlarga biror narsa ayt, mos kel, gaplash va qoʻyib yubor. Profilsiz. Lentasiz. Shovqinsiz.",
      "Sen birinchilardansan. Mahallang ochilganda, birinchi kirganlardan boʻlasan.",
    ],
    next: "Ishga tushishi bilan pochtangga yozamiz.",
    sign: "— Neighbro jamoasi",
    why: "Buni Neighbro kutish roʻyxatiga qoʻshilganing uchun olyapsan.",
  },
  ky: {
    subject: "Тизмедесиң — Neighbro",
    preheader: "Жакшы кошуналар. Чыныгы учурлар. Районуң ачылганда эле кабарлайбыз.",
    hi: "Кош келдиң", title: "Тизмедесиң.",
    body: [
      "Neighbro — жакын болуу өнөрү: азыр айланаңдагы адамдарга бир нерсе айт, дал кел, сүйлөш жана коё бер. Профилсиз. Тасмасыз. Ызы-чуусуз.",
      "Сен биринчилерденсиң. Районуң ачылганда, биринчилерден болуп киресиң.",
    ],
    next: "Иштеп баштаары менен почтаңа жазабыз.",
    sign: "— Neighbro командасы",
    why: "Бул катты Neighbro күтүү тизмесине жазылганың үчүн алдың.",
  },
  tg: {
    subject: "Ту дар рӯйхатӣ — Neighbro",
    preheader: "Ҳамсоягони хуб. Лаҳзаҳои воқеӣ. Ҳамин ки маҳаллаат кушода шавад, менависем.",
    hi: "Хуш омадӣ", title: "Ту дар рӯйхатӣ.",
    body: [
      "Neighbro санъати наздик будан аст — ҳозир ба одамони атрофат чизе гӯй, мувофиқ шав, сӯҳбат кун ва бигзор нопадид шавад. Бе профил. Бе лента. Бе ғавғо.",
      "Ту аз аввалинҳо ҳастӣ. Вақте ки маҳаллаат кушода шавад, аз аввалинҳо шуда медароӣ.",
    ],
    next: "Ҳамин ки ба кор дарояд, ба почтаат менависем.",
    sign: "— дастаи Neighbro",
    why: "Ту ин номаро гирифтӣ, чунки ба рӯйхати интизории Neighbro ҳамроҳ шудӣ.",
  },
  ro: {
    subject: "Ești pe listă — Neighbro",
    preheader: "Vecini buni. Momente reale. Îți spunem în clipa în care se deschide cartierul tău.",
    hi: "Bine ai venit", title: "Ești pe listă.",
    body: [
      "Neighbro e arta de a fi aproape — spune ceva oamenilor din jurul tău chiar acum, dă match, vorbește și lasă să se stingă. Fără profil. Fără feed. Fără zgomot.",
      "Ești printre primii. Când se deschide cartierul tău, vei fi printre primii care intră.",
    ],
    next: "Îți scriem pe mail imediat ce e live.",
    sign: "— echipa Neighbro",
    why: "Primești asta pentru că te-ai înscris pe lista de așteptare Neighbro.",
  },
};

const ACCENTS: Record<string, { accent: string; ink: string }> = {
  "": { accent: "#c6a24e", ink: "#1a1509" },
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

const LANGS: Lang[] = [
  "en", "ru", "fr", "de", "es", "el", "uk", "be", "kk", "ka",
  "hy", "az", "uz", "ky", "tg", "ro",
];

export function welcomeEmail(
  langRaw: string | undefined,
  opts: { accent?: string; mode?: string; brand: Brand },
): { subject: string; from: string; html: string; text: string } {
  const lang: Lang = (LANGS.includes((langRaw ?? "") as Lang) ? langRaw : "en") as Lang;
  const B = opts.brand;
  const rep = (s: string) => s.replaceAll("Neighbro.place", B.domain).replaceAll("Neighbro", B.name);
  const raw = T[lang];
  const t = {
    subject: rep(raw.subject), preheader: rep(raw.preheader), hi: rep(raw.hi),
    title: rep(raw.title), body: raw.body.map(rep), next: rep(raw.next),
    sign: rep(raw.sign), why: rep(raw.why),
  };
  const a = ACCENTS[opts.accent ?? ""] ?? ACCENTS[""];
  const c = opts.mode === "light" ? LIGHT : DARK;
  const ACCENT = a.accent;

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${opts.mode === "light" ? "light" : "dark"}">
<title>${t.subject}</title></head>
<body style="margin:0;padding:0;background:${c.bg};">
<span style="display:none!important;opacity:0;color:${c.bg};font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;">${t.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg};">
 <tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${c.panel};border:1px solid ${c.border};">
   <tr><td style="padding:26px 30px;border-bottom:1px solid ${c.border};">
     <span style="font-family:${SANS};font-weight:800;font-size:18px;letter-spacing:1px;color:${c.fg};">${B.upper}</span>
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
       ${t.why}<br>© 2026 ${B.domain} · by <span style="color:${ACCENT};">PSYTICAN</span>
     </div>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;

  const text = `${t.title}\n\n${t.body.join("\n\n")}\n\n${t.next}\n${t.sign}\n\n${t.why}\n© 2026 ${B.domain} · by PSYTICAN`;
  return { subject: t.subject, from: B.from, html, text };
}
