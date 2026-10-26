// The solo board (chat spec §6.2): a puzzle on one's own empty table while waiting — dots or sea for now (solo-logic.ts).
// It lives on the device; the node only hears «playing alone» on and off (Tables.solo), so neighbours see the mark in the
// list. Testids: solo, solo-line, solo-again, solo-next, solo-close, solo-edge-<edge>, solo-cell-<n>.
import { useEffect, useState } from "react";
import { say } from "../../i18n";
import {
  allEdges, DOTS_N, dotsPuzzle, dotsStatus, drawLine, FLEET, isShip, keepSolo, loadSolo, SEA_N, seaPuzzle, seaStatus, shoot, type SoloSave,
} from "./solo-logic";

export function Solo({ tableId, kind, onClose }: { tableId: string; kind: "dots" | "sea"; onClose: () => void }) {
  const [save, setSave] = useState<SoloSave>(() => loadSolo(tableId));
  useEffect(() => keepSolo(tableId, save), [tableId, save]);
  const restart = (seed: number) => setSave({ seed });

  let line = "", over = false, solved = false, field = null;
  if (kind === "dots") {
    const p = dotsPuzzle(save.seed), play = save.dots ?? { drawn: [] };
    const st = dotsStatus(p, play);
    ({ over, solved } = st);
    line = say("app.solo.dots", { best: p.best, lines: p.lines, left: st.left });
    const cell = 64, pad = 12, size = DOTS_N * cell + pad * 2;
    const at = (e: string) => {
      const [r, c] = e.slice(1).split(",").map(Number);
      return e[0] === "h" ? { x1: pad + c * cell, y1: pad + r * cell, x2: pad + (c + 1) * cell, y2: pad + r * cell }
        : { x1: pad + c * cell, y1: pad + r * cell, x2: pad + c * cell, y2: pad + (r + 1) * cell };
    };
    field = (
      <svg className="solo-dots" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={line}>
        {allEdges().map((e) => {
          const mine = play.drawn.includes(e), given = p.given.includes(e);
          return (
            <line key={e} {...at(e)} className={given ? "solo-given" : mine ? "solo-mine" : "solo-free"} strokeLinecap="round"
              onClick={() => setSave({ ...save, dots: drawLine(p, play, e) })} data-testid={`solo-edge-${e}`} />
          );
        })}
        {Array.from({ length: (DOTS_N + 1) ** 2 }, (_, i) => (
          <circle key={i} cx={pad + (i % (DOTS_N + 1)) * cell} cy={pad + Math.floor(i / (DOTS_N + 1)) * cell} r={5} className="solo-dot" />
        ))}
      </svg>
    );
  } else {
    const p = seaPuzzle(save.seed), play = save.sea ?? { shots: [] };
    const st = seaStatus(p, play);
    over = st.over; solved = st.over;
    line = say("app.solo.sea", { shots: st.shots, sunk: st.sunk, all: FLEET.length });
    field = (
      <div className="solo-sea" role="grid" aria-label={line} style={{ gridTemplateColumns: `repeat(${SEA_N}, 1fr)` }}>
        {Array.from({ length: SEA_N * SEA_N }, (_, i) => {
          const shot = play.shots.includes(i);
          return (
            <button key={i} type="button" className={`solo-cell${shot ? (isShip(p, i) ? " solo-hit" : " solo-miss") : ""}`}
              onClick={() => setSave({ ...save, sea: shoot(p, play, i) })} aria-label={`${Math.floor(i / SEA_N) + 1}-${(i % SEA_N) + 1}`} data-testid={`solo-cell-${i}`} />
          );
        })}
      </div>
    );
  }

  return (
    <div className="solo" data-testid="solo" data-kind={kind} data-over={over ? (solved ? "solved" : "failed") : undefined}>
      <p className="tg-quiet">{say("app.solo.waiting")}</p>
      <p className="solo-line" data-testid="solo-line">{over ? say(solved ? "app.solo.solved" : "app.solo.failed") : line}</p>
      {field}
      <div className="solo-actions">
        <button type="button" className="cta cta-quiet" onClick={() => restart(save.seed)} data-testid="solo-again">{say("app.solo.again")}</button>
        <button type="button" className="cta cta-quiet" onClick={() => restart(save.seed + 1)} data-testid="solo-next">{say("app.solo.next")}</button>
        <button type="button" className="cta cta-quiet" onClick={onClose} data-testid="solo-close">{say("app.solo.close")}</button>
      </div>
    </div>
  );
}
