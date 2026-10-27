import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { layerOf } from "../router";

// One base layer and at most one sheet over it. View Transitions when the
// browser has them (and motion is allowed), plain CSS transitions otherwise.
type Sheet = { id: string; node: ReactNode } | null;
type Stack = { sheet: Sheet; open: (id: string, node: ReactNode) => void; close: () => void };

const Ctx = createContext<Stack | null>(null);
export const useLayers = (): Stack => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLayers outside <LayerStack>");
  return v;
};

const canVT = () =>
  typeof document.startViewTransition === "function" &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Longest a layer's view transition may hold the page; --d-sheet is far below it (MOTION.md). */
export const VT_GUARD_MS = 2000;

function change(direction: "open" | "close" | "screen-open" | "screen-close", update: () => void) {
  const root = document.documentElement;
  if (!canVT()) { update(); return; }
  root.dataset.vt = direction;
  const t = document.startViewTransition(() => flushSync(update));
  // A transition the browser never finishes keeps its pseudo-layer over the page and every tap lands on <html> (crowd
  // flow-1026-190348: Nino, 1920, ten seconds after a sheet closed). Past VT_GUARD_MS it is skipped: the page is
  // already updated, only the animation is lost. A later transition's mark is not taken away by an earlier one.
  const guard = setTimeout(() => t.skipTransition(), VT_GUARD_MS);
  void t.finished.finally(() => { clearTimeout(guard); if (root.dataset.vt === direction) delete root.dataset.vt; });
}

/**
 * The screens that open as a layer (chat, «write», a match: MOTION.md 02-04) over the one they came from: the new
 * screen slides up the full height, the old one goes under (scale .93, dim); closing reverses. The screen switch
 * lives in App, so this holds the OLD screen on the page for one frame, lets the browser snapshot it, and then
 * swaps in the new one inside the view transition. The URL (router.layerOf) says which side the page is on.
 */
function ScreenLayer({ node }: { node: ReactNode }) {
  const now = layerOf(location.pathname) !== null;
  const [over, setOver] = useState(now);
  const last = useRef(node);
  const stale = now !== over;
  useLayoutEffect(() => { if (!stale) last.current = node; });
  useLayoutEffect(() => {
    if (!stale) return;
    change(now ? "screen-open" : "screen-close", () => setOver(layerOf(location.pathname) !== null));
  }, [stale, now]);
  return (
    <>
      {over && <div className="dim-screen" />}
      <div className="layer-screen" data-role={over ? "over" : "under"}>{stale ? last.current : node}</div>
    </>
  );
}

export function LayerStack({ base }: { base: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const open = useCallback((id: string, node: ReactNode) => change("open", () => setSheet({ id, node })), []);
  const close = useCallback(() => change("close", () => setSheet(null)), []);
  // a modal sheet closes on Escape too, as on a tap on the dim
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [sheet, close]);
  return (
    <Ctx.Provider value={{ sheet, open, close }}>
      <div className="layers">
        <div className="layer-base" data-under={sheet ? "true" : "false"} inert={sheet ? true : undefined}><ScreenLayer node={base} /></div>
        <div className="dim" data-on={sheet ? "true" : "false"} onClick={close} />
        {sheet && (
          <div className="layer-sheet" role="dialog" aria-modal="true" key={sheet.id}>{sheet.node}</div>
        )}
      </div>
    </Ctx.Provider>
  );
}
