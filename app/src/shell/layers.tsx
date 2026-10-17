import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

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

function change(direction: "open" | "close", update: () => void) {
  const root = document.documentElement;
  if (!canVT()) { update(); return; }
  root.dataset.vt = direction;
  const t = document.startViewTransition(() => flushSync(update));
  void t.finished.finally(() => { delete root.dataset.vt; });
}

export function LayerStack({ base }: { base: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const open = useCallback((id: string, node: ReactNode) => change("open", () => setSheet({ id, node })), []);
  const close = useCallback(() => change("close", () => setSheet(null)), []);
  return (
    <Ctx.Provider value={{ sheet, open, close }}>
      <div className="layers">
        <div className="layer-base" data-under={sheet ? "true" : "false"} inert={sheet ? true : undefined}>{base}</div>
        <div className="dim" data-on={sheet ? "true" : "false"} onClick={close} />
        {sheet && (
          <div className="layer-sheet" role="dialog" aria-modal="true" key={sheet.id}>{sheet.node}</div>
        )}
      </div>
    </Ctx.Provider>
  );
}
