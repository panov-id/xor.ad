// The pieces the move and away screens share (the prototype's arrival-1…3; departure and away follow them): the bar
// (back and the screen's words, or the brand word), the panel and the action panel, the row of shown characters,
// the foot's buttons, and the pace of the asking. The rules are the core's (depth/core/move_flow.ts).
import { type ReactNode, useEffect, useRef } from "react";
import { oneAtATime } from "@sdk/move_flow.ts";
import { brand } from "@brand";
import { say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";

/** How often the state is asked, as the web asks it (web/src/api/transfer.ts MOVE_POLL_MS). */
export const MOVE_POLL_MS = 2_000;

/** Every `ms` while `on`, one ask at a time (move_flow.ts oneAtATime). */
export function useEvery(ms: number, tick: () => Promise<unknown> | undefined, on: boolean): void {
  const latest = useRef(tick);
  latest.current = tick;
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(oneAtATime(() => latest.current()), ms);
    return () => clearInterval(timer);
  }, [ms, on]);
}

/** The bar (the prototype's arrival-1…3): back round and the flow's words in the pill, or (no `title`) the brand word alone. */
export function MoveBar({ title, onBack }: { title?: string; onBack?: () => void }) {
  return (
    <header className="k-row k-bar">
      {title === undefined
        ? <p className="k-bar-title">{brand.name}</p>
        : (
          <>
            {onBack && <button type="button" className="k-bar-btn" aria-label={say("common.back")} onClick={onBack} data-testid="move-back"><NdIcon name="back" /></button>}
            <p className="k-bar-title">{title}</p>
          </>
        )}
    </header>
  );
}

/** The panel under the bar with the screen's body, and the action panel with its foot. */
export function MoveSheet({ children, foot, className }: { children: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <>
      <section className={className ? `k-panel k-grow k-reg ${className}` : "k-panel k-grow k-reg"}>{children}</section>
      {foot && <section className="k-panel k-actions k-stack">{foot}</section>}
    </>
  );
}

/** Characters shown, not typed: the code in rows of three, the four check characters in one row. */
export function Shown({ chars, columns, testid }: { chars: readonly string[]; columns: number; testid: string }) {
  return (
    <p className="k-shown" style={{ ["--cols" as string]: columns }} data-testid={testid} aria-label={chars.join(" ")}>
      {chars.map((c, i) => <span key={i} aria-hidden="true">{c}</span>)}
    </p>
  );
}
