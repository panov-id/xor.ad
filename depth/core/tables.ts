// Tables (G2): the core of a board game at a table, by the contract
// docs/api/openapi.yaml (tables, built with G1/G1b/G1c on 2026-09-27) — not by
// protocol §4.6–4.7, whose shapes the node no longer follows.
//
// The core states facts; the words are the screens' (depth/ink, web).
import type { Answer, Client, Radius } from "./client.ts";

const nonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

export type BoardClass = "grid" | "free" | "dots" | "deck" | "dice" | "physics" | "word";

export interface TableSeat { seat: number; name: string; role: "playing" | "watching"; hand_count?: number }
export interface Board {
  seq: number;
  state: { order?: number[]; moves?: Array<{ seat: number; move?: unknown; pass?: boolean }> } & Record<string, unknown>;
  turn: number;
  score: Record<string, number>;
  over?: boolean;
  expires_at: number;
  pending?: { kind: string; id: string; class?: string; set?: string; answers?: unknown; until?: number } | null;
}
export interface TableLine {
  id: string;
  seat: number;
  kind: "line" | "application" | "refusal" | "sticker" | "move" | "congratulation";
  text?: string;
  sticker?: string;
  created_at: number;
}
export interface TableView {
  id: string;
  class: BoardClass;
  set: string;
  seat: number;
  is_playing: boolean;
  playing: number;
  watching: number;
  name?: string;
  like_count?: number;
  seats: TableSeat[];
  // null once the game is over and none has started again (G1b).
  board: Board | null;
  lines: TableLine[];
}
export interface NewTable {
  class: BoardClass;
  set: string;
  lat: number;
  lon: number;
  area_radius: Radius;
  seats: number;
  name?: string;
}

const at = (id: string, rest = "") => `/tables/${encodeURIComponent(id)}${rest}`;

export class Tables {
  constructor(private readonly client: Client) {}

  create(table: NewTable): Promise<Answer<{ id: string }>> {
    return this.client.tableCall("POST", "/tables", { ...table, nonce: nonce() });
  }
  view(id: string): Promise<Answer<TableView>> {
    return this.client.tableCall("GET", at(id));
  }
  sit(id: string): Promise<Answer<unknown>> {
    return this.client.tableCall("POST", at(id, "/seat"));
  }
  stand(id: string): Promise<Answer<unknown>> {
    return this.client.tableCall("DELETE", at(id, "/seat"));
  }
  like(id: string): Promise<Answer<unknown>> {
    return this.client.tableCall("POST", at(id, "/like"));
  }
  unlike(id: string): Promise<Answer<unknown>> {
    return this.client.tableCall("DELETE", at(id, "/like"));
  }
  // A line, an application or a sticker from the catalogue.
  say(id: string, line: { kind: "line" | "application"; text: string } | { kind: "sticker"; sticker: string }): Promise<Answer<unknown>> {
    return this.client.tableCall("POST", at(id, "/lines"), line);
  }
  // A refusal names the seat whose application it answers in this round and
  // carries words; otherwise 400/409 (G1c).
  refuse(id: string, seat: number, text: string): Promise<Answer<unknown>> {
    return this.client.tableCall("POST", at(id, "/lines"), { kind: "refusal", seat, text });
  }
  // seq is the board the move was made on: the same body again answers the
  // same board, another version 409 stale_seq.
  move(id: string, seq: number, move: unknown): Promise<Answer<Board>> {
    return this.client.tableCall("POST", at(id, "/moves"), { seq, move });
  }
  pass(id: string, seq: number): Promise<Answer<Board>> {
    return this.client.tableCall("POST", at(id, "/moves"), { seq, pass: true });
  }
  propose(id: string, kind: "rematch" | "draw" | "undo", next?: { class: BoardClass; set: string }): Promise<Answer<{ id: string }>> {
    return this.client.tableCall("POST", at(id, "/proposals"), { kind, ...next });
  }
  answer(id: string, pid: string, answer: "accept" | "decline" | "counter", next?: { class: BoardClass; set: string }): Promise<Answer<unknown>> {
    return this.client.tableCall("POST", at(id, `/proposals/${encodeURIComponent(pid)}`), { answer, ...next });
  }
  resign(id: string): Promise<Answer<unknown>> {
    return this.client.tableCall("POST", at(id, "/resign"));
  }
}

// What a screen says about the turn, without a word of its own.
export function turnOf(view: TableView, now = Date.now()): { mine: boolean; name: string | null; secondsLeft: number | null } {
  const board = view.board;
  if (!board || board.over) return { mine: false, name: null, secondsLeft: null };
  const who = view.seats.find((s) => s.seat === board.turn);
  return {
    mine: view.is_playing && board.turn === view.seat,
    name: who?.name ?? null,
    secondsLeft: Math.max(0, board.expires_at - Math.floor(now / 1000)),
  };
}

// Applications still waiting: one not followed by a refusal naming its seat
// (a refusal line's seat is the refused one, G1c).
export function openApplications(view: TableView): TableLine[] {
  const refused = new Set(view.lines.filter((l) => l.kind === "refusal").map((l) => l.seat));
  return view.lines.filter((l) => l.kind === "application" && !refused.has(l.seat));
}

// The dots class (G1c): n×n boxes; an edge is "h:r:c" — above box r,c, r in
// 0..n — or "v:r:c" — left of box r,c, c in 0..n; a box "r:c" names the seat
// that closed it. The node keeps the rules; the core only draws and lists.
export interface Dots { n: number; edges: string[]; boxes: Record<string, number> }

export function dotsOf(board: Board | null): Dots | null {
  const dots = board?.state.dots as Dots | undefined;
  return dots && typeof dots.n === "number" && Array.isArray(dots.edges) ? dots : null;
}

export function freeEdges(dots: Dots): string[] {
  const taken = new Set(dots.edges);
  const all: string[] = [];
  for (let r = 0; r <= dots.n; r++) for (let c = 0; c < dots.n; c++) all.push(`h:${r}:${c}`);
  for (let r = 0; r < dots.n; r++) for (let c = 0; c <= dots.n; c++) all.push(`v:${r}:${c}`);
  return all.filter((e) => !taken.has(e));
}

// Text rows: "·" a dot, "───" and "│" taken edges, the closer's seat number
// inside a box; `mark` shows the edge about to be taken as "═══" or "║".
export function drawDots(dots: Dots, mark?: string): string[] {
  const taken = new Set(dots.edges);
  const rows: string[] = [];
  for (let r = 0; r <= dots.n; r++) {
    let line = "·";
    for (let c = 0; c < dots.n; c++) {
      const e = `h:${r}:${c}`;
      line += (e === mark ? "═══" : taken.has(e) ? "───" : "   ") + "·";
    }
    rows.push(line);
    if (r === dots.n) break;
    let cells = "";
    for (let c = 0; c <= dots.n; c++) {
      const e = `v:${r}:${c}`;
      cells += e === mark ? "║" : taken.has(e) ? "│" : " ";
      if (c < dots.n) {
        const seat = dots.boxes[`${r}:${c}`];
        cells += seat === undefined ? "   " : ` ${seat} `;
      }
    }
    rows.push(cells);
  }
  return rows;
}
