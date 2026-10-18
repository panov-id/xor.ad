// The pieces the move and away sheets share (w2_departure-*, w2_arrival-*, w2_away): the bar over the
// sheet (back and the screen's words, or the brand word), the sheet itself, the row of shown characters,
// the foot's buttons, and the pace of the asking. The rules are the core's (depth/core/move_flow.ts).
import { type ReactNode, useEffect, useRef } from "react";
import { oneAtATime } from "@sdk/move_flow.ts";
import { brand } from "@brand";
import { say } from "../i18n";
import { Icon } from "../shell/Icon";
import { chevronLeft } from "../shell/icons";

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

/** The bar over the sheet: back and the flow's words, or (no `title`) the brand word alone. */
export function MoveBar({ title, onBack }: { title?: string; onBack?: () => void }) {
  return (
    <header className="mv-bar">
      {title === undefined
        ? <p className="mv-brand">{brand.name}</p>
        : (
          <>
            {onBack
              ? <button type="button" className="mv-back" aria-label={say("common.back")} onClick={onBack} data-testid="move-back"><Icon d={chevronLeft} /></button>
              : <span className="mv-back" aria-hidden="true" />}
            <p className="mv-title">{title}</p>
          </>
        )}
    </header>
  );
}

/** The sheet under the bar: the screen's body, and its foot pinned to the bottom. */
export function MoveSheet({ children, foot, className }: { children: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <div className="mv-sheet">
      <div className={className ? `mv-body ${className}` : "mv-body"}>
        {children}
        {foot && <div className="mv-foot">{foot}</div>}
      </div>
    </div>
  );
}

/** Characters shown, not typed: the code in rows of three, the four check characters in one row. */
export function Shown({ chars, columns, testid }: { chars: readonly string[]; columns: number; testid: string }) {
  return (
    <p className="mv-shown" style={{ ["--cols" as string]: columns }} data-testid={testid} aria-label={chars.join(" ")}>
      {chars.map((c, i) => <span key={i} className="mv-char" aria-hidden="true">{c}</span>)}
    </p>
  );
}
