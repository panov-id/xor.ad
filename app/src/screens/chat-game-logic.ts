// The game in a conversation, the shell's own rules (sosed Dusk: w3_chat-game), apart from React: which stage the
// chat's game is at, as depth/core/chat_games.ts reports it (the web's ChatGame.tsx reads the same view).
import type { ChatGameView } from "../../../depth/core/chat_games.ts";

export type GameStage =
  | { at: "none" }
  // A proposal (a game, or another round after one is over): mine waits for the other side, theirs asks me.
  | { at: "offered"; mine: boolean; kind: "game" | "rematch"; id: string; set: string }
  | { at: "playing"; turn: "mine" | "theirs" | null }
  | { at: "over" };

/** The stage of the chat's game; null (404: no game) and a declined proposal (no board, nothing pending) are none. */
export function stageOf(view: ChatGameView | null): GameStage {
  if (!view) return { at: "none" };
  const p = view.pending;
  if (p && (p.kind === "rematch" || !view.board)) return { at: "offered", mine: p.mine, kind: p.kind, id: p.id, set: p.set ?? view.set };
  const b = view.board;
  if (!b) return { at: "none" };
  if (b.over) return { at: "over" };
  return { at: "playing", turn: b.turn === null ? null : b.turn === view.your_seat ? "mine" : "theirs" };
}

/** The line over the panel (w3_chat-game «Nino proposed a game · you accepted»): the side that proposed is seat 1. */
export function proposerKey(view: ChatGameView): string {
  return view.your_seat === 1 ? "app.game.you_proposed" : "app.game.they_proposed";
}

/** The game the chat's chip proposes (w3_chat «Backgammon?»): the dice class, the backgammon set. */
export const CHIP_GAME = { class: "dice", set: "backgammon" } as const;
