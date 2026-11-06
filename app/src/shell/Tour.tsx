// The «?» tour (HELP_tours.md; look from the archive's data-tour blocks: a ring round the target under a dimmed screen, a card with
// «n of m», dots, title, text, Skip and Next). Reusable: a list of steps naming a target by data-testid.
// Focusable: the card takes focus, Tab stays inside it, Escape closes, focus goes back to what opened it.
// Reduced motion: the card's pop is in screens.css under no-preference only.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { say } from "../i18n";
import { nextStep, type TourStep } from "./tour-logic";

interface Box { top: number; left: number; width: number; height: number }

const PAD = 6;
const CARD_W = 300;

function boxOf(testid: string): Box | null {
  const el = document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width === 0 && r.height === 0 ? null : { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function Tour({ steps, onClose }: { steps: ReadonlyArray<TourStep>; onClose: () => void }) {
  const [at, setAt] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[at];
  const last = nextStep(at, steps.length) === null;

  useLayoutEffect(() => {
    const measure = () => setBox(boxOf(step.target));
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, [step.target]);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    card.current?.focus();
    return () => back?.focus?.();
  }, []);

  // the card has key={at}: a new step is a new element, and focus left on body would lose Escape and the Tab trap
  useEffect(() => { card.current?.focus(); }, [at]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab") return;
    const items = Array.from(card.current?.querySelectorAll<HTMLElement>("button") ?? []);
    if (items.length === 0) return;
    const first = items[0], end = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  };

  // the card under the target when it fits, else above it; centred when the target is not there
  const vw = innerWidth, vh = innerHeight;
  const width = Math.min(CARD_W, vw - 32);
  const style: React.CSSProperties = { width };
  if (box) {
    const below = box.top + box.height + PAD + 12;
    style.left = Math.max(16, Math.min(vw - width - 16, box.left + box.width / 2 - width / 2));
    if (below + 190 < vh) style.top = below; else style.bottom = Math.max(16, vh - box.top + PAD + 12);
  } else {
    style.left = (vw - width) / 2;
    style.top = Math.max(16, vh / 2 - 90);
  }

  return createPortal(
    <div className="k-tour" data-testid="tour">
      {box
        ? <div className="k-tour-ring" aria-hidden="true" style={{ top: box.top - PAD, left: box.left - PAD, width: box.width + 2 * PAD, height: box.height + 2 * PAD }} />
        : <div className="k-tour-dim" aria-hidden="true" />}
      <div ref={card} className="k-tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1} style={style} onKeyDown={onKey} key={at} data-testid="tour-card" data-step={at}>
        <div className="k-row k-tour-top">
          <span className="k-tour-count">{say("app.tour.step", { n: at + 1, m: steps.length })}</span>
          <span className="k-tour-dots" aria-hidden="true">{steps.map((_, i) => <i key={i} data-on={i === at ? "1" : undefined} />)}</span>
        </div>
        <p className="k-tour-title" id="tour-title">{step.title}</p>
        <p className="k-tour-text">{step.text}</p>
        <div className="k-row k-tour-foot">
          <button type="button" className="k-tour-skip" onClick={onClose} data-testid="tour-close">{say(last ? "app.tour.close" : "app.tour.skip")}</button>
          {!last && <button type="button" className="k-tour-next" onClick={() => setAt(nextStep(at, steps.length) ?? at)} data-testid="tour-next">{say("app.tour.next")}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
