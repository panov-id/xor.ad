// Tables (G2): the core of a board game at a table, by the contract
// docs/api/openapi.yaml (tables, built with G1/G1b/G1c on 2026-09-27) — not by
// protocol §4.6–4.7, whose shapes the node no longer follows.
//
// The core states facts; the words are the screens' (depth/ink, web).
import type { Answer, Client, Frame, Radius, Room } from "./client.ts";

const nonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

export type BoardClass = "grid" | "free" | "dots" | "deck" | "dice" | "physics" | "word";

export interface TableSeat { seat: number; name: string; role: "playing" | "watching"; hand_count?: number }
export interface Board {
  seq: number;
  state: { order?: number[]; moves?: Array<{ seat: number; move?: unknown; pass?: boolean }> } & Record<string, unknown>;
  // null before the first game starts (seen live on G1c).
  turn: number | null;
  score: Record<string, number>;
  over?: boolean;
  expires_at: number | null;
  pending?: { kind: string; id: string; class?: string; set?: string; answers?: unknown; until?: number } | null;
}
export interface TableLine {
  id: string;
  seat: number;
  kind: "line" | "application" | "refusal" | "sticker" | "move" | "congratulation";
  text?: string;
  sticker?: string;
  // On a refusal: the seat whose application it answers; `seat` stays the
  // one who refused (G1e, 838ed40).
  refuses_seat?: number | null;
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
  move(id: string, seq: number, move: unknown): Promise<Answer<{ board: Board }>> {
    return this.client.tableCall("POST", at(id, "/moves"), { seq, move });
  }
  pass(id: string, seq: number): Promise<Answer<{ board: Board }>> {
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
  // No game yet (turn null) or over: nobody's turn, no clock.
  if (!board || board.over || board.turn === null) return { mine: false, name: null, secondsLeft: null };
  const who = view.seats.find((s) => s.seat === board.turn);
  return {
    mine: view.is_playing && board.turn === view.seat,
    name: who?.name ?? null,
    secondsLeft: board.expires_at === null ? null : Math.max(0, board.expires_at - Math.floor(now / 1000)),
  };
}

// Applications from those still watching, not answered by a refusal that
// came after them: a refusal names the refused seat in refuses_seat (G1e) and
// holds for its round only — after a rematch the same seat may apply again,
// and the node takes it (verifier, live, 2026-09-27). Lines come in order.
export function openApplications(view: TableView): TableLine[] {
  const watching = new Set(view.seats.filter((s) => s.role === "watching").map((s) => s.seat));
  return view.lines.filter((l, i) =>
    l.kind === "application" && watching.has(l.seat) &&
    !view.lines.slice(i + 1).some((r) => r.kind === "refusal" && r.refuses_seat === l.seat)
  );
}

// The table's socket (protocol §4.4; G1e): a ticket, then the room
// "table:<id>" on GET /chat. Frames: board — the board whole; seat —
// {playing, watching}; line — one published line; name_verdict — to the
// table's author. Losing the seat closes the room 4005.
export async function openTable(client: Client, id: string): Promise<Room> {
  const answer = await client.tableCall<{ ticket: string }>("POST", at(id, "/ticket"));
  if (answer.status !== 200) throw new Error(`no table ticket: ${answer.status} ${JSON.stringify(answer.body)}`);
  return client.openRoomWith(answer.body.ticket);
}

// A frame laid onto the view the screen holds. A line goes on as it is; a
// board or a seat frame changes who plays, whose seat and whose turn, which
// only GET /tables/:id says whole — so frameNeedsView tells the screen to read
// the table once (verifier, 2026-09-27: after a rematch the frames alone left
// a new player is_playing false). Unknown frames leave the view as it was.
export function applyFrame(view: TableView, frame: Frame): TableView {
  const data = frame.data as Record<string, unknown> | null;
  if (frame.type === "board") return { ...view, board: data as unknown as Board | null };
  if (frame.type === "seat" && data) {
    return { ...view, playing: Number(data.playing ?? view.playing), watching: Number(data.watching ?? view.watching) };
  }
  if (frame.type === "line" && data && typeof data.id === "string") {
    if (view.lines.some((l) => l.id === data.id)) return view;
    return { ...view, lines: [...view.lines, data as unknown as TableLine] };
  }
  return view;
}

export const frameNeedsView = (frame: Frame) => frame.type === "board" || frame.type === "seat";

// 4005: the seat is gone (stood up, dropped, kicked) — the room will not
// come back with a new ticket; the screen leaves the table.
export const SEAT_LOST = 4005;

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
