import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";

// BoardPanel (strict review 11.10, «weld the adjacent»): the score and the turn
// are one strip welded onto the board, in one outline — the table's scoreboard,
// not three lines above it. A seat is its name and, once the game has a score,
// its number; the last cell is the turn (its words, a timer and the time) or the
// end. `children` are the boards; the panel owns the frame and the seams.
export type PanelSeat = { seat: number; name: string; score?: number };
export type PanelTurn = {
  testid: "turn" | "over";
  text: string;
  mine?: boolean;
  /** The time left on the move, already in words («4 мин 58 с»); with it the timer icon stands before it. */
  time?: string;
};

export function BoardPanel({ seats, seatedLabel, turn, landed, children, ...rest }:
  { seats: PanelSeat[]; seatedLabel: string; turn: PanelTurn; children?: ReactNode;
    /** What lands on a seat's cell for a moment (a sticker said at the table). */
    landed?: { seat: number; node: ReactNode } } & { [data: `data-${string}`]: string | undefined }) {
  return (
    <section {...rest} className="ui-boardpanel" aria-label={seatedLabel}>
      <span className="visually-hidden">{seatedLabel}: {seats.map((s) => s.name).join(" · ")}</span>
      <ul className="ui-boardpanel-strip" role="list" data-testid="score">
        {seats.map((s) => (
          <li key={s.seat} className="ui-boardpanel-cell" data-seat={s.seat}>
            <span>{s.name}</span>
            {s.score !== undefined && <strong className="ui-boardpanel-score">{s.score}</strong>}
            {landed?.seat === s.seat && landed.node}
          </li>
        ))}
        <li className="ui-boardpanel-cell ui-boardpanel-turn" data-testid={turn.testid} data-mine={turn.mine ? "yes" : "no"}>
          <span>{turn.text}</span>
          {turn.time !== undefined && (
            <>
              <span className="visually-hidden"> · </span>
              <span className="ui-boardpanel-time"><Icon name="timer" size={16} /><span>{turn.time}</span></span>
            </>
          )}
        </li>
      </ul>
      <div className="ui-boardpanel-body">{children}</div>
    </section>
  );
}
