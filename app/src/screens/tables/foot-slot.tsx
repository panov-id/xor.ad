// The table foot's slot for a game's own turn buttons (owner 27.10.2026, «Прототип + ввод»: the *-turn sheets put roll,
// take, bets, ends in the foot). The board keeps its state and portals the buttons there; with no slot (the board in a
// chat, chat-game.tsx) they stay where the board draws them. kit.css hides the stickers while the slot has buttons.
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const FootSlot = createContext<HTMLElement | null>(null);

export function InFoot({ children }: { children: ReactNode }) {
  const slot = useContext(FootSlot);
  return slot ? createPortal(children, slot) : <>{children}</>;
}
