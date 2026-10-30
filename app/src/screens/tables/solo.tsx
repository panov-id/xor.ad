// The solo board (chat spec §6.2): a puzzle on one's own empty table while waiting — dots or sea for now (solo-logic.ts).
// It lives on the device; the node only hears «playing alone» on and off (Tables.solo), so neighbours see the mark in the
// list. Testids: solo, solo-line, solo-again, solo-next, solo-close, solo-edge-<edge>, solo-cell-<n>.
import { useEffect, useState } from "react";
import { say } from "../../i18n";
import { InFoot } from "./foot-slot";
import { NdIcon } from "../../shell/NdIcon";
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

  // table-solo.html: a head row (hourglass, the waiting words over the line, the game chip that puts the puzzle away),
  // the field, then a round «again» and the wide «next» pill
  return (
    <div className="solo" data-testid="solo" data-kind={kind} data-over={over ? (solved ? "solved" : "failed") : undefined}>
      <div className="k-row solo-head">
        <span className="k-tb-key" aria-hidden="true"><NdIcon name="hourglass" /></span>
        <span className="k-stack k-grow"><b>{say("app.solo.waiting")}</b><span className="solo-line" data-testid="solo-line">{over ? say(solved ? "app.solo.solved" : "app.solo.failed") : line}</span></span>
        <button type="button" className="k-chip" aria-label={say("app.solo.close")} onClick={onClose} data-testid="solo-close"><NdIcon name={kind === "dots" ? "g-dots" : "g-battleship"} /><span>{say("app.solo.close")}</span></button>
      </div>
      <div className="solo-field">{field}</div>
      <InFoot><div className="k-row solo-foot">
        <button type="button" className="k-tb-key" aria-label={say("app.solo.again")} onClick={() => restart(save.seed)} data-testid="solo-again"><NdIcon name="refresh" /></button>
        <button type="button" className="k-cta" onClick={() => restart(save.seed + 1)} data-testid="solo-next"><NdIcon name="chev" /><span>{say("app.solo.next")}</span></button>
      </div></InFoot>
    </div>
  );
}
