// A game inside a conversation (GC3; the node's routes/chat_games.ts, GC1).
// The two sides propose, answer, move, ask for a rematch and resign; the node
// keeps the rules and cuts the board by seat, as at a table. Frames `board`
// and `proposal` come on the chat's own socket (chat/room.ts gives them as
// `sys`); on either, the screen reads the game again — the node builds the
// view, nothing here puts one together from a frame.

import type { Answer, Client } from "../../../depth/core/client.ts";
import type { Board, BoardClass, TableView } from "../../../depth/core/tables.ts";

export interface ChatGamePending {
  id: string;
  kind: "game" | "rematch";
  class?: BoardClass;
  set?: string;
  mine: boolean;
}

export interface ChatGameView {
  class: BoardClass;
  set: string;
  your_seat: number | null;
  board: Board | null;
  pending: ChatGamePending | null;
}

const path = (chatId: string, rest = "") => `/chats/${encodeURIComponent(chatId)}/game${rest}`;

export class ChatGames {
  constructor(private readonly client: Client) {}

  // 404 is "no game in this conversation", not a failure.
  look(chatId: string): Promise<Answer<ChatGameView>> {
    return this.client.request<ChatGameView>("GET", path(chatId));
  }
  propose(chatId: string, klass: BoardClass, set: string): Promise<Answer<unknown>> {
    return this.client.request("POST", path(chatId), { class: klass, set });
  }
  answer(chatId: string, answer: "accept" | "decline"): Promise<Answer<unknown>> {
    return this.client.request("POST", path(chatId, "/answer"), { answer });
  }
  move(chatId: string, seq: number, move: unknown): Promise<Answer<ChatGameView>> {
    return this.client.request<ChatGameView>("POST", path(chatId, "/moves"), { seq, move });
  }
  rematch(chatId: string): Promise<Answer<{ id: string }>> {
    return this.client.request<{ id: string }>("POST", path(chatId, "/proposals"), { kind: "rematch" });
  }
  answerRematch(chatId: string, pid: string, answer: "accept" | "decline"): Promise<Answer<unknown>> {
    return this.client.request("POST", path(chatId, `/proposals/${encodeURIComponent(pid)}`), { answer });
  }
  resign(chatId: string): Promise<Answer<unknown>> {
    return this.client.request("POST", path(chatId, "/resign"), {});
  }
}

// The boards of TableBoards.tsx take a table's view; a conversation's game is
// the same board with two seats — mine and the other side's — and no lines.
export function asTableView(chatId: string, game: ChatGameView, names: { mine: string; theirs: string }): TableView {
  const mine = game.your_seat ?? 1;
  const theirs = mine === 1 ? 2 : 1;
  return {
    id: chatId,
    class: game.class,
    set: game.set,
    seat: mine,
    is_playing: true,
    playing: 2,
    watching: 0,
    seats: [
      { seat: mine, name: names.mine, role: "playing" },
      { seat: theirs, name: names.theirs, role: "playing" },
    ],
    board: game.board,
    lines: [],
  };
}
