// w4_place + docs/newsdesign/place-flow.svg: a city typed (the offline list, depth/core/place.ts searchCities — nothing
// leaves the device to name a place), the first two found as rows with their country; or a point pasted from a map
// (Enter moves the map there); the way to the place's QR. Below, our own map (place-map.ts: land tiles from
// app/public/geo, the device's cities, the circle): drag it, pinch or wheel it through the five radius steps, and
// «Here» keeps its centre where the web keeps a place ("place.v1", storePlace, the same shape), named by the nearest
// city. The top keeps w4_place's layout; the map's blocks follow it. The radius is shown, not kept: the feed keeps
// its own chips (the stored shape has no radius). Testids (the web's): place-search, place-city, place-point,
// place-qr, error; new: place-now, place-map, place-radius, place-near, place-here.
import { type FormEvent, type PointerEvent as PEvent, useEffect, useRef, useState, type WheelEvent } from "react";
import type { Radius } from "@sdk/client.ts";
import { type City, nameOf, parsePoint, type Place as PlaceT, searchCities, storePlace } from "@sdk/place.ts";
import { LANG, say } from "../../i18n";
import { storedPlace } from "../../place";
import { RADII, radiusWord } from "../feed-logic";
import { Field } from "../register-parts";
import { pin, qr } from "./icons";
import { countryName } from "./me-logic";
import { type At, citiesOn, dragged, pinched, pxPerM, type Tile, tilePath, tilesFor, toView } from "./place-map";
import { ErrorLine, Row, SubPage } from "./parts";
import "./cities";

/** How many cities the list shows (the sheet draws two). */
export const SHOWN = 2;
/** The feed's own fallback (web FALLBACK): where it looks until a place is chosen. */
const ROME = "Rome";

const radiusText = (r: Radius): string => {
  const w = radiusWord(r);
  return say(w.key, { n: w.n });
};

// Tiles once per session; a cell with no file (open sea) or a failed load is null: the map draws no land there.
const tiles = new Map<string, Promise<Tile | null>>();
function tile(key: string): Promise<Tile | null> {
  let t = tiles.get(key);
  if (!t) {
    t = fetch(`${import.meta.env.BASE_URL}geo/${key}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (j && Array.isArray(j.r) ? j as Tile : null)).catch(() => null);
    tiles.set(key, t);
  }
  return t;
}
let cityList: Promise<City[]> | null = null;
const allCities = () => (cityList ??= import("@cities").then((m) => (m.default as unknown as { cities: City[] }).cities).catch(() => []));

function PlaceMap({ at, radius, onMove, onRadius }: { at: At; radius: Radius; onMove: (c: At) => void; onRadius: (r: Radius) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 358, h: 440 });
  const [land, setLand] = useState<{ key: string; t: Tile }[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const touch = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ at: At; radius: Radius; gap: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { void allCities().then(setCities); }, []);
  const keys = tilesFor(at, radius, size.w, size.h).join(",");
  useEffect(() => {
    let live = true;
    void Promise.all(keys ? keys.split(",").map((k) => tile(k).then((t) => (t ? { key: k, t } : null))) : [])
      .then((got) => { if (live) setLand(got.filter((x): x is { key: string; t: Tile } => x !== null)); });
    return () => { live = false; };
  }, [keys]);
  const s = pxPerM(radius, size.w, size.h);
  const gap = () => { const [a, b] = [...touch.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  const down = (e: PEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    touch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start.current = { at, radius, gap: gap() };
  };
  const move = (e: PEvent) => {
    const was = touch.current.get(e.pointerId);
    if (!was) return;
    if (touch.current.size === 1) onMove(dragged(at, e.clientX - was.x, e.clientY - was.y, s));
    touch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const up = (e: PEvent) => {
    if (touch.current.size === 2 && start.current?.gap) onRadius(pinched(start.current.radius, gap() / start.current.gap));
    touch.current.delete(e.pointerId);
    start.current = null;
  };
  const wheel = (e: WheelEvent) => { if (e.deltaY) onRadius(pinched(radius, e.deltaY < 0 ? 3 : 1 / 3)); };
  const ring = Math.min(size.w, size.h) / 2 / 1.6;
  return (
    <div ref={box} className="me-map" data-testid="place-map" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}
      role="img" aria-label={say("app.place.map")}>
      <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
        {land.map(({ key, t }) => <path key={key} className="me-map-land" fillRule="evenodd" d={tilePath(key, t, at, s, size.w, size.h)} />)}
        {citiesOn(cities, at, radius, size.w, size.h).map((c) => {
          // a label clear of the pin (the centre city sits under it) and inside the view (the right third reads leftwards)
          const under = Math.hypot(c.x - size.w / 2, c.y - size.h / 2) < 20, left = c.x > size.w * 0.6;
          const dx = under ? 22 : 8;
          return (
            <g key={`${c.name}-${c.x}`} className="me-map-city"><circle cx={c.x} cy={c.y} r={3} />
              <text x={left ? c.x - dx : c.x + dx} y={c.y + 4} textAnchor={left ? "end" : "start"}>{c.name}</text></g>
          );
        })}
        <circle className="me-map-ring" cx={size.w / 2} cy={size.h / 2} r={ring} />
        <circle className="me-map-pin" cx={size.w / 2} cy={size.h / 2} r={14} />
      </svg>
    </div>
  );
}

export function Place({ onChosen, onBack, onQr, start }: { onChosen: (p: PlaceT) => void; onBack: () => void; onQr: () => void; start?: { lat: number; lon: number; s: number } }) {
  // a place QR opened: its point is where the map starts and its step the radius; «Here» still keeps it, nothing moves alone
  const now = useRef(storedPlace()).current;
  const from = start ?? now;
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PlaceT[]>([]);
  const [point, setPoint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<At>({ lat: from.lat, lon: from.lon });
  const [named, setNamed] = useState<PlaceT | null>(null);   // a city picked and not moved since: kept by its own name
  const [near, setNear] = useState<{ name: string; cc: string } | null>(null);
  const [radius, setRadius] = useState<Radius>(start ? (RADII[start.s - 1] ?? 1000) : 1000);
  useEffect(() => {
    let live = true;
    void searchCities(q, SHOWN).then((list) => { if (live) setFound(list); }).catch(() => { if (live) setFound([]); });
    return () => { live = false; };
  }, [q]);
  useEffect(() => {
    if (named) return setNear({ name: named.name, cc: named.cc ?? "" });
    let live = true;
    const t = setTimeout(() => void nameOf(at.lat, at.lon).then((n) => { if (live) setNear(n); }).catch(() => {}), 200);
    return () => { live = false; clearTimeout(t); };
  }, [at, named]);
  const go = (p: PlaceT) => { setAt({ lat: p.lat, lon: p.lon }); setNamed(p); };
  async function fromPoint(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const p = parsePoint(point);
    if (!p) return setError(say("web.place.badPoint"));
    setNamed(null);
    setAt(p);
  }
  async function here() {
    const p: PlaceT = named ?? { ...at, ...(near ?? (await nameOf(at.lat, at.lon))), source: "point" };
    storePlace(p);
    onChosen(p);
  }
  const step = RADII.indexOf(radius);
  return (
    <SubPage name="place" title={say("app.place.title")} onBack={onBack}
      foot={<button type="button" className="cta cta-primary" onClick={() => void here()} data-testid="place-here">{say("app.place.here")}</button>}>
      <Field text={say("app.place.city")} value={q} onChange={setQ} testid="place-search" autoComplete="off" />
      {found.length > 0 && (
        <ul className="me-list" data-testid="place-found">
          {found.map((p) => (
            <li key={`${p.name}-${p.cc}-${p.lat}`}>
              <Row icon={pin} text={p.name} value={countryName(LANG, p.cc)} onOpen={() => go(p)} testid="place-city" />
            </li>
          ))}
        </ul>
      )}
      <form className="me-point" onSubmit={(e) => void fromPoint(e)}>
        <Field text={say("app.place.point")} value={point} onChange={setPoint} testid="place-point" autoComplete="off" />
      </form>
      <ErrorLine text={error} />
      <Row icon={qr} text={say("app.place.qr")} onOpen={onQr} testid="place-qr" />
      <p className="me-place-now" data-testid="place-now">
        {/* opened by a place QR: the web's question (web.qr.ask), not «not chosen, Rome» over the QR's point */}
        {start ? say("web.qr.ask", { where: near?.name ?? "…" }) : now.chosen ? say("app.place.now", { place: now.name }) : say("app.place.unset", { place: ROME })}
      </p>
      <p className="me-place-hint">{say("app.place.drag")}</p>
      <PlaceMap at={at} radius={radius} onMove={(c) => { setNamed(null); setAt(c); }} onRadius={setRadius} />
      <label className="me-radius">
        <span className="me-radius-head"><span>{say("app.place.radius")}</span><b>{radiusText(radius)}</b></span>
        <input type="range" min={0} max={RADII.length - 1} step={1} value={step} onChange={(e) => setRadius(RADII[Number(e.target.value)])}
          aria-valuetext={radiusText(radius)} data-testid="place-radius" />
        <span className="me-radius-steps" aria-hidden="true">{RADII.map((r) => <span key={r}>{radiusText(r)}</span>)}</span>
      </label>
      <div className="me-place-card" data-testid="place-near">
        <p>{near ? say("app.place.near", { city: near.name, radius: radiusText(radius) }) : " "}</p>
        <p>{say("app.place.feed")}</p>
      </div>
    </SubPage>
  );
}
