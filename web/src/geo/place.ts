// Where the person is (owner 11.10.2026): the browser's geolocation, a city from a small offline list (GeoNames
// cities15000, English names, CC BY 4.0 — scripts/geo/build-cities.sh), or a point pasted from a map
// («34.6823, 33.0464»). Nothing leaves the device to name a place: the list is ours and loads only when the
// picker opens. A name typed in one's own script is transliterated to Latin and matched with a small
// tolerance (Лимассол → limassol → Limassol; Москва → moskva ≈ Maskva → Moscow).

export type Place = { lat: number; lon: number; name: string; cc?: string; source: "geo" | "city" | "point" };
type City = [string, string, number, number, number, string[]?];

const KEY = "place.v1";
// Rome, until a person says where they are — the stand's old fixed point (App.tsx before 11.10.2026).
export const FALLBACK: Place = { lat: 41.9, lon: 12.5, name: "Rome", cc: "IT", source: "city" };

export function storedPlace(): Place | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && typeof p.name === "string" ? p : null;
  } catch { return null; }
}
export function storePlace(p: Place): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window: kept for this visit only */ }
}

// Cyrillic (ru, uk, be, kk, ky, tg), Greek, Georgian, Armenian to Latin — close enough to find a city.
const MAP: Record<string, string> = {
  "\u0430": "a", "\u0431": "b", "\u0432": "v", "\u0433": "g", "\u0491": "g", "\u0434": "d", "\u0435": "e", "\u0451": "e", "\u0454": "ye", "\u0436": "zh", "\u0437": "z", "\u0438": "i", "\u0456": "i", "\u0457": "yi", "\u0439": "y",
  "\u043a": "k", "\u043b": "l", "\u043c": "m", "\u043d": "n", "\u043e": "o", "\u043f": "p", "\u0440": "r", "\u0441": "s", "\u0442": "t", "\u0443": "u", "\u045e": "u", "\u0444": "f", "\u0445": "kh", "\u0446": "ts", "\u0447": "ch",
  "\u0448": "sh", "\u0449": "shch", "\u044a": "", "\u044b": "y", "\u044c": "", "\u044d": "e", "\u044e": "yu", "\u044f": "ya", "\u04d9": "a", "\u0493": "g", "\u049b": "k", "\u04a3": "n", "\u04e9": "o", "\u04b1": "u", "\u04af": "u",
  "\u04bb": "h", "\u04ef": "u", "\u04b3": "h", "\u04b7": "j", "\u04e3": "i",
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o",
  π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
  ა: "a", ბ: "b", გ: "g", დ: "d", ე: "e", ვ: "v", ზ: "z", თ: "t", ი: "i", კ: "k", ლ: "l", მ: "m", ნ: "n", ო: "o", პ: "p",
  ჟ: "zh", რ: "r", ს: "s", ტ: "t", უ: "u", ფ: "p", ქ: "k", ღ: "gh", ყ: "q", შ: "sh", ჩ: "ch", ც: "ts", ძ: "dz", წ: "ts",
  ჭ: "ch", ხ: "kh", ჯ: "j", ჰ: "h",
  ա: "a", բ: "b", գ: "g", դ: "d", ե: "e", զ: "z", է: "e", ը: "y", թ: "t", ժ: "zh", ի: "i", լ: "l", խ: "kh", ծ: "ts", կ: "k",
  հ: "h", ձ: "dz", ղ: "gh", ճ: "ch", մ: "m", յ: "y", ն: "n", շ: "sh", ո: "o", չ: "ch", պ: "p", ջ: "j", ռ: "r", ս: "s",
  վ: "v", տ: "t", ր: "r", ց: "ts", ւ: "v", փ: "p", ք: "k", օ: "o", ֆ: "f", և: "ev",
};
export function latin(s: string): string {
  return [...s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")].map((ch) => MAP[ch] ?? ch).join("")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// «34.6823, 33.0464», «34.6823 33.0464», «34,6823; 33,0464» — what a map hands over. Null when it is no point.
export function parsePoint(s: string): { lat: number; lon: number } | null {
  const m = s.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1].replace(",", ".")), lon = Number(m[2].replace(",", "."));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

let cities: Promise<City[]> | null = null;
// Tests hand the list over themselves (node reads the JSON from disk; the page lets Vite split it off).
export function useCities(list: City[]): void { cities = Promise.resolve(list); }
function load(): Promise<City[]> {
  cities ??= import("./cities.json").then((m) => (m.default as unknown as { cities: City[] }).cities);
  return cities;
}

// Within `max` edits of the same length's prefix: «moskva» ≈ «maskva».
function near(a: string, b: string, max: number): boolean {
  const p = b.slice(0, a.length);
  if (Math.abs(p.length - a.length) > max) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= p.length; j++) {
    let prev = d[0]; d[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const t = d[i];
      d[i] = Math.min(d[i] + 1, d[i - 1] + 1, prev + (a[i - 1] === p[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[a.length] <= max;
}

// The cities whose name (or a Latin alternate) starts with what was typed, the biggest first; with a typo or a
// transcription off by a letter or two when nothing starts exactly so.
export async function searchCities(q: string, limit = 8): Promise<Place[]> {
  const t = latin(q);
  if (t.length < 2) return [];
  const all = await load();
  const names = (c: City) => [c[0], ...(c[5] ?? [])].map(latin);
  // exact prefixes and, from 4 letters, those a letter or two off — together, the biggest first (the list is
  // sorted by population): a small town whose alternate starts «moskva» must not hide Moscow behind «maskva».
  // Exact prefixes come first, the near ones after them: «Limas» is Limassol before Lima.
  const tol = t.length >= 7 ? 2 : 1;
  const exact = all.filter((c) => names(c).some((n) => n.startsWith(t)));
  const close = t.length >= 4 ? all.filter((c) => !exact.includes(c) && names(c).some((n) => near(t, n, tol))) : [];
  const hit = [...exact, ...close];
  return hit.slice(0, limit).map((c) => ({ name: c[0], cc: c[1], lat: c[2], lon: c[3], source: "city" as const }));
}

// The nearest city of the list, to name a point from geolocation or a map.
export async function nameOf(lat: number, lon: number): Promise<{ name: string; cc: string }> {
  const all = await load();
  let best = all[0], bd = Infinity;
  for (const c of all) {
    const dx = (c[3] - lon) * Math.cos((lat * Math.PI) / 180), dy = c[2] - lat, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = c; }
  }
  return { name: best[0], cc: best[1] };
}

// The browser's own position; null when refused or unavailable.
export function here(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((done) => {
    if (!("geolocation" in navigator)) return done(null);
    navigator.geolocation.getCurrentPosition((p) => done({ lat: p.coords.latitude, lon: p.coords.longitude }), () => done(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  });
}
