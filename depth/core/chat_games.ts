// A game in a chat of two (GC2), by the contract docs/api/openapi.yaml and
// protocol §4.7 (built on the node with GC1, 2026-09-27). The engine is the
// tables': the same classes, the same moves, the same board — so a screen
// draws it with the table's boards (depth/ink/table_boards.ts) from a
// TableView made out of the chat's view (asTableView below).
//
// The two sides are seat 1 (who proposed the game) and seat 2; identities
// never come from the node. Frames come to the conversation's own room:
// board — the board as this side sees it, or null when the game is gone;
// proposal — {id, kind, class, set, mine}, or null when taken back.
import type { Answer, Client } from "./client.ts";
import type { Board, BoardClass, TableView } from "./tables.ts";

export interface ChatPending { id: string; kind: "game" | "rematch"; class?: BoardClass; set?: string; mine: boolean }
export interface ChatGameView {
  class: BoardClass;
  set: string;
  your_seat: number | null;
  // null until the other side accepts.
  board: Board | null;
  pending: ChatPending | null;
}

const at = (chatId: string, rest = "") => `/chats/${encodeURIComponent(chatId)}/game${rest}`;

export class ChatGames {
  constructor(private readonly client: Client) {}

  // 404: no game in this chat (or the chat is over for either side).
  view(chatId: string): Promise<Answer<ChatGameView>> {
    return this.client.gameCall("GET", at(chatId));
  }
  propose(chatId: string, klass: BoardClass, set: string): Promise<Answer<unknown>> {
    return this.client.gameCall("POST", at(chatId), { class: klass, set });
  }
  answer(chatId: string, answer: "accept" | "decline" | "counter", next?: { class: BoardClass; set: string }): Promise<Answer<unknown>> {
    return this.client.gameCall("POST", at(chatId, "/answer"), { answer, ...next });
  }
  // seq is the board the move was made on, as at a table.
  move(chatId: string, seq: number, move: unknown): Promise<Answer<ChatGameView>> {
    return this.client.gameCall("POST", at(chatId, "/moves"), { seq, move });
  }
  pass(chatId: string, seq: number): Promise<Answer<ChatGameView>> {
    return this.client.gameCall("POST", at(chatId, "/moves"), { seq, pass: true });
  }
  // Hangman's word has a route of its own; the node checks it and answers 202.
  word(chatId: string, word: string): Promise<Answer<ChatGameView>> {
    return this.client.gameCall("POST", at(chatId, "/word"), { word });
  }
  rematch(chatId: string): Promise<Answer<{ id: string }>> {
    return this.client.gameCall("POST", at(chatId, "/proposals"), { kind: "rematch" });
  }
  answerRematch(chatId: string, pid: string, answer: "accept" | "decline"): Promise<Answer<unknown>> {
    return this.client.gameCall("POST", at(chatId, `/proposals/${encodeURIComponent(pid)}`), { answer });
  }
  resign(chatId: string): Promise<Answer<unknown>> {
    return this.client.gameCall("POST", at(chatId, "/resign"));
  }
  end(chatId: string): Promise<Answer<unknown>> {
    return this.client.gameCall("DELETE", at(chatId));
  }
}

// The frames of a game in the conversation's room.
export const isGameFrame = (frame: { type: string }) => frame.type === "board" || frame.type === "proposal";

// The chat's view as a table's, so the table's boards draw it unchanged: two
// seats, both playing, named as the screen names the two sides.
export function asTableView(chatId: string, view: ChatGameView, names: { mine: string; theirs: string }): TableView {
  const mine = view.your_seat ?? 1;
  return {
    id: chatId,
    class: view.class,
    set: view.set,
    seat: mine,
    is_playing: true,
    playing: 2,
    watching: 0,
    seats: [1, 2].map((seat) => ({ seat, name: seat === mine ? names.mine : names.theirs, role: "playing" as const })),
    board: view.board,
    lines: [],
  };
}

// Whose turn it is, from this side: mine, theirs, or nobody's (none yet or over).
export function chatTurn(view: ChatGameView): "mine" | "theirs" | null {
  const b = view.board;
  if (!b || b.over || b.turn === null) return null;
  return b.turn === view.your_seat ? "mine" : "theirs";
}
