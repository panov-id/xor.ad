// w4_place + docs/newsdesign/place-flow.svg: a city typed (the offline list, depth/core/place.ts searchCities — nothing
// leaves the device to name a place), the first two found as rows with their country; or a point pasted from a map
// (Enter moves the map there); the way to the place's QR. Below, our own map (place-map.ts: land tiles from
// app/public/geo, the device's cities, the circle): drag it, pinch or wheel it through the five radius steps, and
// «Here» keeps its centre where the web keeps a place ("place.v1", storePlace, the same shape), named by the nearest
// city. The top keeps w4_place's layout; the map's blocks follow it. The radius is shown, not kept: the feed keeps
// its own chips (the stored shape has no radius). Testids (the web's): place-search, place-city, place-point,
// place-qr, error; new: place-now, place-map, place-radius, place-near, place-here.
import { type FormEvent, type PointerEvent as PEvent, type ReactNode, useContext, useEffect, useRef, useState, type WheelEvent } from "react";
import type { Radius } from "@sdk/client.ts";
import { type City, nameOf, parsePoint, type Place as PlaceT, searchCities, storePlace } from "@sdk/place.ts";
import { LANG, say } from "../../i18n";
import { storedPlace } from "../../place";
import { RADII, radiusWord, widenedFor } from "../feed-logic";
import { EntryScene } from "../../shell/EntryScene";
import { NdIcon } from "../../shell/NdIcon";
import { Field } from "../register-parts";
import { pin } from "./icons";
import { PlaceMapScreen } from "../../nd4/screens/place-map.gen";
import { PlaceMapScreenTablet } from "../../nd4/screens/place-map-tablet.gen";
import { Rail, RailTablet } from "../../shell/TabBar";
import { useMinWidth } from "../../shell/useMinWidth";
import { PlaceMapScreenLaptop } from "../../nd4/screens/place-map-laptop.gen";
import { PlaceScreen } from "../../nd4/screens/place.gen";
import { PlaceScreenTablet } from "../../nd4/screens/place-tablet.gen";
import { PlaceScreenLaptop } from "../../nd4/screens/place-laptop.gen";
import { PlaceRow } from "../../nd4/screens/place-row.gen";
import { PlaceRowTablet } from "../../nd4/screens/place-row-tablet.gen";
import { PlaceRowLaptop } from "../../nd4/screens/place-row-laptop.gen";
import { countryName } from "./me-logic";
import { type At, citiesOn, dragged, metres, nearKind, onLand, pinched, pxPerM, type Tile, tilePath, tilesFor, toView } from "./place-map";
import { ErrorLine, InPane, Row, SubPage } from "./parts";
import { allPlaces } from "./cities";

/** How many cities the list shows (the sheet draws two). */
export const SHOWN = 2;
/** The feed's own fallback (web FALLBACK): where it looks until a place is chosen. */
const ROME = "Rome";

const radiusText = (r: Radius): string => {
  const w = radiusWord(r);
  return say(w.key, { n: w.n });
};

// Tiles once per session; a cell with no file (404: open sea) is an empty tile, a failed load is null: the map draws
// no land for either, but only the first is known to be sea (docs/newdesign4 screens 26 and 28).
const tiles = new Map<string, Promise<Tile | null>>();
function tile(key: string): Promise<Tile | null> {
  let t = tiles.get(key);
  if (!t) {
    t = fetch(`${import.meta.env.BASE_URL}geo/${key}.json`).then((r) => (r.ok ? r.json() : r.status === 404 ? { r: [] } : null)).then((j) => (j && Array.isArray(j.r) ? j as Tile : null)).catch(() => null);
    tiles.set(key, t);
  }
  return t;
}
let cityList: Promise<City[]> | null = null;
/** The cities nearest a point (equirectangular: enough to order neighbours). */
export function nearest(all: City[], at: { lat: number; lon: number }, n: number): PlaceT[] {
  const k = Math.cos((at.lat * Math.PI) / 180);
  const d = (c: City) => (c[2] - at.lat) ** 2 + ((c[3] - at.lon) * k) ** 2;
  return [...all].sort((a, b) => d(a) - d(b)).slice(0, n).map((c) => ({ name: c[0], cc: c[1], lat: c[2], lon: c[3], source: "city" as const }));
}
const allCities = () => (cityList ??= allPlaces().catch(() => []));

function PlaceMap({ at, radius, onMove, onRadius, onSea }: { at: At; radius: Radius; onMove: (c: At) => void; onRadius: (r: Radius) => void; onSea?: (sea: boolean | null) => void }) {
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
      .then((got) => {
        if (!live) return;
        const ok = got.filter((x): x is { key: string; t: Tile } => x !== null);
        setLand(ok);
        // known only when every tile of the view came back; below LAND_FROM no tiles are asked for
        onSea?.(keys && ok.length === got.length ? !onLand(at, ok) : null);
      });
    return () => { live = false; };
  // at too: a drag inside one tile moves the pin off or onto land; the tiles come from the session's cache
  }, [keys, at.lat, at.lon]);
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
    <div ref={box} className="k-map" data-testid="place-map"
      // from LAND_FROM the land tiles are drawn over the sea: the box's ground is then the archive's sea (screens 24, 26)
      data-sea={land.length ? "" : undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}
      role="img" aria-label={say("app.place.map")}>
      <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
        {land.map(({ key, t }) => <path key={key} className="k-map-land" fillRule="evenodd" d={tilePath(key, t, at, s, size.w, size.h)} />)}
        {citiesOn(cities, at, radius, size.w, size.h).map((c) => {
          // a label clear of the pin (the centre city sits under it) and inside the view (the right third reads leftwards)
          const under = Math.hypot(c.x - size.w / 2, c.y - size.h / 2) < 20, left = c.x > size.w * 0.6;
          const dx = under ? 22 : 8;
          return (
            <g key={`${c.name}-${c.x}`} className="k-map-city"><circle cx={c.x} cy={c.y} r={c.label ? 3 : 2} />
              {c.label && <text x={left ? c.x - dx : c.x + dx} y={c.y + 4} textAnchor={left ? "end" : "start"}>{c.name}</text>}</g>
          );
        })}
        <circle className="k-map-ring" cx={size.w / 2} cy={size.h / 2} r={ring} />
        <circle className="k-map-pin" cx={size.w / 2} cy={size.h / 2} r={14} />
        <circle className="k-map-pin-dot" cx={size.w / 2} cy={size.h / 2} r={4} />
      </svg>
    </div>
  );
}

export function Place({ onChosen, onBack, onQr, start, wizard }: { onChosen: (p: PlaceT) => void; onBack: () => void; onQr: () => void; start?: { lat: number; lon: number; s: number }; wizard?: ReactNode }) {
  // a place QR opened: its point is where the map starts and its step the radius; «Here» still keeps it, nothing moves alone
  const now = useRef(storedPlace()).current;
  const from = start ?? now;
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PlaceT[]>([]);
  const [point, setPoint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<At>({ lat: from.lat, lon: from.lon });
  const [named, setNamed] = useState<PlaceT | null>(null);   // a city picked and not moved since: kept by its own name
  const [near, setNear] = useState<{ name: string; cc: string; m?: number } | null>(null);
  const [sea, setSea] = useState<boolean | null>(null);
  const [radius, setRadius] = useState<Radius>(start ? (RADII[start.s - 1] ?? 1000) : 1000);
  useEffect(() => {
    let live = true;
    // wizard-5 draws two cities before a letter is typed: the nearest to the point
    const list = wizard && !q.trim() ? allCities().then((all) => nearest(all, from, SHOWN)) : searchCities(q, SHOWN);
    void list.then((l) => { if (live) setFound(l); }).catch(() => { if (live) setFound([]); });
    return () => { live = false; };
  }, [q, wizard]);
  useEffect(() => {
    if (named) return setNear({ name: named.name, cc: named.cc ?? "" });
    let live = true;
    const t = setTimeout(() => void allCities().then((all) => nearest(all, at, 1)[0]).then((c) => (c ? { name: c.name, cc: c.cc ?? "", m: metres(at, c) } : nameOf(at.lat, at.lon)))
      .then((n) => { if (live) setNear(n); }).catch(() => {}), 200);
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
  const [view, setView] = useState<"main" | "map">("main");
  const frame = useRef<HTMLElement>(null);
  const [fits, setWide] = useState<"phone" | "tablet" | "laptop">("phone");
  // the laptop drawing needs its frame and nav, which come at --bp-desktop (nd4-kit.css @media 1440, TabBar useMinWidth):
  // a window of 1000..1439 keeps the tablet drawing (correctness lens 01.11)
  const desk = useMinWidth("--bp-desktop");
  // inside Me's side pane (1440+) the page stays the phone drawing: the pane is no window, it has no room for a rail and
  // the frame's 100dvh would overflow it (correctness lens 01.11: at 1920 the 680 pane measured as a tablet)
  const pane = useContext(InPane);
  const wide = pane ? "phone" : fits === "laptop" && !desk ? "tablet" : fits;
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 1000 ? "laptop" : e.contentRect.width >= 600 ? "tablet" : "phone"));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);
  const [coords, setCoords] = useState(false);
  const hereBtn = <button type="button" className="cta cta-primary" onClick={() => void here()} data-testid="place-here"><NdIcon name="check" /><span>{say("app.place.here")}</span></button>;
  const nowLine = start ? say("web.qr.ask", { where: near?.name ?? "…" }) : now.chosen ? say("app.place.now", { place: now.name }) : say("app.place.unset", { place: ROME });
  const kind = near ? nearKind(sea, named ? 0 : near.m ?? 0, radius) : "near";
  const nearLine = !near ? " " : kind === "none" ? say("app.place.around", { radius: radiusText(radius) })
    : say(kind === "sea" ? "app.place.sea" : "app.place.near", { city: near.name, radius: radiusText(radius) });
  // the feed's widening was measured at the saved place: a point moved off it has no such fact (panel 31.10, F1)
  const atSaved = now.chosen && Math.abs(at.lat - now.lat) < 1e-6 && Math.abs(at.lon - now.lon) < 1e-6;
  const wider = atSaved ? widenedFor(radius) : null;
  if (wizard) {
    // wizard-5: the place as the intro's fifth step: the intro's bar, the pin with the title and the line, the search,
    // the found cities as two tiles in a row (the picked one lit), the row for a point from a map, «here» at the foot
    return (
      <main className="k-screen" data-screen="intro" data-step="place">
        <EntryScene title={say("app.place.title")} text={say("app.place.feed")} icon="place" />
        <div className="k-col">
          {wizard}
          <section className="k-panel k-grow k-reg k-intro-place" data-testid="intro-place">
            <div className="k-row"><NdIcon name="place" /><div className="k-stack"><h2 className="k-title">{say("app.place.title")}</h2><p className="k-sub">{say("app.place.feed")}</p></div></div>
            <Field text={say("app.place.city")} value={q} onChange={setQ} testid="place-search" autoComplete="off" icon="search" />
            <div className="k-hub k-intro-cities" data-testid="place-found">
              {found.map((p, i) => (
                <button type="button" key={`${p.name}-${p.cc}-${p.lat}`} className="k-hub-tile" data-small="" data-accent={(named ? named.name === p.name && named.cc === p.cc : !q.trim() && i === 0) ? "" : undefined}
                  onClick={() => go(p)} data-testid="place-city">
                  <span className="k-badge" aria-hidden="true"><NdIcon name="place" /></span>
                  <span className="k-stack"><span className="k-row-name">{p.name}</span><span className="k-meta">{countryName(LANG, p.cc)}</span></span>
                </button>
              ))}
            </div>
            <button type="button" className="k-hub-tile" data-wide="" aria-expanded={coords} onClick={() => setCoords((c) => !c)} data-testid="place-coords">
              <span className="k-badge" aria-hidden="true"><NdIcon name="coords" /></span>
              <span className="k-stack"><span className="k-meta">{say("app.place.point")}</span></span>
            </button>
            {coords && (
              <form onSubmit={(e) => void fromPoint(e)}>
                <Field text={say("app.place.point")} value={point} onChange={setPoint} testid="place-point" autoComplete="off" icon="coords" />
              </form>
            )}
            <ErrorLine text={error} />
            <p className="k-sr" data-testid="place-now">{nowLine}</p>
          </section>
          <section className="k-panel k-actions">{hereBtn}</section>
        </div>
      </main>
    );
  }
  if (view === "map") {
    // docs/newdesign4 screens 23–29 `place-map…`: the archive's markup as is (nd4/screens/place-map.gen.tsx, made by
    // scripts/design/nd4-extract.py); this file gives only the data: the live map, the step, the lines, the handlers.
    // the archive draws the screen at 390 (phone) and 820 (tablet) and gives no point between: 600 is mine, the
    // middle; it is the screen's own width, so in the wide shell's side panel the phone's drawing stays. 1000 is mine
    // too: the tablet file is 820 wide, the laptop's screen beside the nav about 1160; the laptop draws map + panel
    const Screen = wide === "laptop" ? PlaceMapScreenLaptop : wide === "tablet" ? PlaceMapScreenTablet : PlaceMapScreen;
    return (
      <main ref={frame} className="k-screen nd-screen nd-place-map" data-screen="place" data-view="map" data-width={wide}>
        {wide === "laptop" && <Rail active="feed" />}
        {wide === "tablet" && <RailTablet active="feed" />}
        <Screen
          map={<PlaceMap at={at} radius={radius} onMove={(c) => { setNamed(null); setAt(c); }} onRadius={setRadius} onSea={setSea} />}
          step={step} steps={RADII.map(radiusText)} onRange={(e) => setRadius(RADII[Number(e.target.value)])} radiusLabel={say("app.place.radius")}
          near={nearLine} kind={kind}
          wider={wider !== null ? say("app.place.wider", { radius: radiusText(radius), wide: radiusText(wider as Radius) }) : undefined}
          title={say(wide === "laptop" ? "app.place.yours" : "app.place.title")} lead={say("app.place.lead")} moveText={say("app.place.drag")} hereText={say("app.place.here")}
          backLabel={say("app.reg.back")}
          onBack={() => setView("main")} onHere={() => void here()} />
      </main>
    );
  }
  // docs/newdesign4 screen 22 `place`: the archive's markup as is (nd4/screens/place*.gen.tsx, made by
  // scripts/design/nd4-extract.py); this file gives the data. The list under «How far» is the archive's «Recent» row
  // (place-row*.gen.tsx): the found cities while typing, a pasted point, else the two ways the archive has no tile for
  // (a place QR, a point from a map: brief 01.11). «Where I am now»: the app has no location yet, it says so (brief 01.11).
  const Main = wide === "laptop" ? PlaceScreenLaptop : wide === "tablet" ? PlaceScreenTablet : PlaceScreen;
  const PRow = wide === "laptop" ? PlaceRowLaptop : wide === "tablet" ? PlaceRowTablet : PlaceRow;
  const typed = parsePoint(q);
  const rows = typed
    ? [<PRow key="pt" d={6} name={`${typed.lat.toFixed(4)}, ${typed.lon.toFixed(4)}`} sub={say("app.place.pointRow")} testid="place-point-row"
        onOpen={() => { setNamed(null); setAt(typed); setQ(""); }} />]
    : q.trim()
      ? found.map((p, i) => <PRow key={`${p.name}-${p.cc}-${p.lat}`} d={6 + i} name={p.name} sub={countryName(LANG, p.cc)} testid="place-city" onOpen={() => { go(p); setQ(""); }} />)
      : [<PRow key="qr" d={6} name={say("app.place.qr")} sub={say("app.place.qrRow")} testid="place-qr" onOpen={onQr} />,
         <PRow key="pt" d={7} name={say("app.place.point")} sub={say("app.place.pointHint")} testid="place-coords" onOpen={() => setError(say("app.place.pointHow"))} />];
  return (
    <main ref={frame} className="k-screen nd-screen nd-place" data-screen="place" data-view="main" data-width={wide}>
      {wide === "laptop" && <Rail active="feed" />}
      {wide === "tablet" && <RailTablet active="feed" />}
      <Main title={say("app.place.yours")} backLabel={say("app.reg.back")} onBack={onBack}
        q={q} onQ={(e) => { setError(null); setQ(e.target.value); }} searchText={say("app.place.search")}
        name={near?.name ?? (now.chosen ? now.name : ROME)} sub={[near?.cc ? countryName(LANG, near.cc) : "", radiusText(radius)].filter(Boolean).join(" · ")}
        mapText={say("app.place.onMap")} onMap={() => setView("map")}
        farText={say("app.place.far")} step={step} steps={RADII.map(radiusText)} onStep={(i) => () => setRadius(RADII[i])}
        listShown={rows.length > 0} listLabel={say(q.trim() ? "app.place.found" : "app.place.more")} list={rows}
        note={error ?? (start ? nowLine : say("app.place.note"))} hereText={say("app.place.done")} onHere={() => void here()} />
      <p className="k-sr" data-testid="place-now">{nowLine}</p>
      <div className="k-sr" data-testid="place-near"><p>{nearLine}</p></div>
      <p className="k-sr" role="status" data-testid="place-error">{error ?? ""}</p>
    </main>
  );
}
