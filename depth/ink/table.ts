// The table (docs/depth-client_RU.md §4.9; G2): the board as the node gives
// it, who sits, whose turn and how long, the lines since one's own seating.
// Said aloud, as §4.9 asks: no end-to-end encryption here, and a line waits
// for the moderation queue like a phrase. The board lives in the process only.
import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Say } from "./strings.ts";
import { Form, Head, Menu, plain, useKeys } from "./parts.ts";
import { Board } from "./table_boards.ts";
import type { Room } from "../core/client.ts";
import {
  applyFrame, type BoardClass, dotsOf, drawDots, frameNeedsView, freeEdges, openApplications, SEAT_LOST, type Tables, type TableView, turnOf,
} from "../core/tables.ts";

export type TableAction = "move" | "pass" | "say" | "rematch" | "stand" | "resign" | "like";

export function Table(
  { say, view, onPick, onMove, now }: {
    say: Say; view: TableView; onPick: (action: TableAction) => void; onMove?: (move: unknown) => void; now?: number;
  },
): ReactElement {
  const turn = turnOf(view, now);
  const board = view.board;
  const counts = `${say("table.playing")} ${plain(view.playing, 6)} · ${say("table.watching")} ${plain(view.watching, 6)} · ♥ ${plain(view.like_count ?? 0, 6)}`;
  const seated = view.seats.map((s) => (s.seat === view.seat ? say("table.you") : plain(s.name, 48))
    + (s.hand_count !== undefined ? ` · ${plain(s.hand_count, 6)}` : "")).join(" · ");
  const score = board
    ? view.seats.filter((s) => board.score[String(s.seat)] !== undefined).map((s) => `${plain(s.name, 48)} ${plain(board.score[String(s.seat)], 6)}`).join(" · ")
    : "";
  const moves = board?.state.moves ?? [];
  // Everything the node sends is someone else's text: through plain() before
  // the terminal sees it, or a neighbour's ESC[2J clears my screen (FX4).
  const nameOf = (seat: number) => plain(view.seats.find((s) => s.seat === seat)?.name ?? `#${seat}`, 48);
  const waiting = openApplications(view);
  // Dots (G1c): [ and ] walk the free edges, the marked one goes on "move".
  const dots = dotsOf(board);
  const free = dots ? freeEdges(dots) : [];
  const [at, setAt] = useState(0);
  const edge = free.length ? free[Math.min(at, free.length - 1)] : undefined;
  // The other classes' boards have controls of their own (table_boards.ts):
  // tab hands the arrows between the board and the table's row.
  const other = !!board && !dots && board.state && Object.keys(board.state).some((k) => ["deck", "word", "free", "grid", "dice", "physics"].includes(k));
  const [wantBoard, setOnBoard] = useState(false);
  // The board holds the arrows only while it has something to press — its
  // class is there and the turn is mine; otherwise they fall back to the row
  // (verifier, 2026-09-27: after a move, or a round with no class, the focus
  // stuck on a board with no buttons and «встать» could not be reached).
  const onBoard = wantBoard && !!other && turn.mine;
  // The wish ends with the turn: when it comes back, a key meant for the
  // row must not play a card (verifier, 2026-09-27).
  useEffect(() => {
    if (!turn.mine) setOnBoard(false);
  }, [turn.mine]);
  useKeys((input, key) => {
    if (other && turn.mine && key.tab) return setOnBoard(!onBoard);
    if (!free.length) return;
    if (input === "]") setAt((i) => (Math.min(i, free.length - 1) + 1) % free.length);
    if (input === "[") setAt((i) => (Math.min(i, free.length - 1) - 1 + free.length) % free.length);
  });
  // The pending proposal carries who made it (by, the node's lockGame): one's
  // own is waited on, another's is answered.
  const pending = board?.pending as { kind?: string; by?: number } | null | undefined;
  const theirRematch = pending?.kind === "rematch" && pending.by !== view.seat;
  const actions: Array<{ key: TableAction; label: string; disabled?: boolean }> = [
    ...(dots ? [{ key: "move" as const, label: `${say("table.move")} ${edge ?? ""}`, disabled: !turn.mine || !edge }] : []),
    { key: "pass", label: say("table.pass"), disabled: !turn.mine },
    { key: "say", label: say("table.say") },
    // A game starts only on a rematch everyone at the table agrees to (the
    // node builds rematch alone): another's open proposal is accepted here.
    {
      key: "rematch",
      label: theirRematch ? say("table.acceptRematch") : say("table.rematch"),
      disabled: view.seats.length < 2 || (board?.pending?.kind === "rematch" && !theirRematch),
    },
    { key: "resign", label: say("table.resign"), disabled: !view.is_playing || !board || !!board.over },
    { key: "like", label: say("table.like") },
    { key: "stand", label: say("table.stand") },
  ];
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, {
      title: `${say("table.title")}${view.name ? ` · "${plain(view.name, 48)}"` : ""} · ${plain(view.class, 12)}`,
      lines: [counts, `${say("table.seated")}  ${seated}`, say("table.open")],
    }),
    board === null
      ? h(Text, { dimColor: true }, say("table.over"))
      : h(
        Box,
        { flexDirection: "column" },
        h(Text, { color: turn.mine ? "green" : undefined },
          board.over ? say("table.over")
          : board.turn === null ? say("table.notStarted")
          : turn.mine ? `${say("table.yourTurn")} · ${turn.secondsLeft} ${say("table.seconds")}`
          : `${say("table.turn")}: ${plain(turn.name ?? "—", 48)} · ${turn.secondsLeft} ${say("table.seconds")}`),
        score ? h(Text, null, `${say("table.score")}: ${score}`) : null,
        ...(dots ? drawDots(dots, turn.mine ? edge : undefined).map((row, i) => h(Text, { key: `d${i}` }, plain(row, 80))) : []),
        other ? h(Board, { say, view, onMove: turn.mine ? onMove : undefined, active: onBoard }) : null,
        ...moves.slice(-5).map((m, i) =>
          h(Text, { key: `m${i}`, dimColor: true }, `${nameOf(m.seat)}  ${m.pass ? say("table.passed") : plain(JSON.stringify(m.move), 80)}`)
        ),
      ),
    h(
      Box,
      { flexDirection: "column" },
      ...view.lines.filter((l) => l.kind !== "move").slice(-6).map((l) =>
        h(Text, { key: l.id }, `${nameOf(l.seat)}  ${l.kind === "sticker" ? `[${plain(l.sticker, 32)}]` : plain(l.text, 200)}`)
      ),
      ...waiting.map((l) => h(Text, { key: `w${l.id}`, color: "yellow" }, `${say("table.application")}: ${nameOf(l.seat)}`)),
    ),
    h(Menu, {
      actions,
      active: !onBoard,
      onPick: (key) => key === "move" && edge ? onMove?.({ edge }) : onPick(key as TableAction),
      hint: dots ? `[ ] ${say("table.edge")} · ${say("common.rowActions")}`
        : other ? `tab ${say("table.toBoard")} · ${say("common.rowActions")}` : say("common.rowActions"),
    }),
  );
}

// The table live (C1): read once, then the socket's frames (G1e) instead of a
// read every 2 s — a line goes on as it comes, a board or a seat frame reads
// the table again, 4005 (the seat lost) leaves it. Moves and passes go through
// the core; their refusals come back as a line of text.
export function TableRoom(
  { say, tables, open, tableId, onLeave, onError }: {
    say: Say;
    tables: Pick<Tables, "view" | "move" | "pass" | "stand" | "resign" | "like" | "say" | "propose" | "answer">;
    open: (tableId: string) => Promise<Room>;
    tableId: string;
    onLeave: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [view, setView] = useState<TableView | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [saying, setSaying] = useState<string | null>(null);
  const read = () =>
    tables.view(tableId).then((a) => (a.status === 200 ? setView(a.body) : onError(`${a.status} ${JSON.stringify(a.body)}`)));
  useEffect(() => {
    let live = true;
    let room: Room | null = null;
    read().catch((e: Error) => onError(e.message));
    open(tableId).then(async (r) => {
      room = r;
      void r.closed.then((code) => {
        live = false;
        if (code === SEAT_LOST) onLeave();
      });
      while (live) {
        const frame = await r.next(60_000).catch(() => null);
        if (!frame || !live) continue;
        if (frameNeedsView(frame)) await read().catch((e: Error) => onError(e.message));
        else setView((v) => (v ? applyFrame(v, frame) : v));
      }
    }).catch((e: Error) => onError(e.message));
    return () => {
      live = false;
      room?.close();
    };
  }, [tableId]);
  if (!view) return h(Text, { dimColor: true }, "…");
  const answer = (run: Promise<{ status: number; body: unknown }>) =>
    void run.then((a) => {
      const error = (a.body as { error?: { code?: string; reason?: string } } | null)?.error;
      setSaid(a.status >= 400 ? `${say("table.refused")}: ${plain(error?.reason ?? error?.code ?? a.status, 200)}` : null);
    }).catch((e: Error) => onError(e.message));
  if (saying !== null) {
    // A line at the table goes through the moderation queue like a phrase
    // (§4.9): 202, and it shows once published.
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Head, { title: say("table.say"), lines: [say("table.open")] }),
      h(Form, {
        fields: [{ key: "line", label: say("table.say"), value: saying }],
        onChange: (_k, v) => setSaying(graphemes(v, 128)),
        actions: [{ key: "send", label: say("table.send"), disabled: !saying.trim() }, { key: "back", label: say("common.back") }],
        onPick: (key) => {
          if (key === "send" && saying.trim()) answer(tables.say(tableId, { kind: "line", text: saying.trim() }));
          setSaying(null);
        },
      }),
    );
  }
  return h(
    Box,
    { flexDirection: "column" },
    h(Table, {
      say,
      view,
      onMove: (move) => {
        if (view.board) answer(tables.move(tableId, view.board.seq, move));
      },
      onPick: (action) => {
        if (action === "stand") return void tables.stand(tableId).then(onLeave).catch((e: Error) => onError(e.message));
        if (action === "pass" && view.board) return answer(tables.pass(tableId, view.board.seq));
        if (action === "resign") return answer(tables.resign(tableId));
        if (action === "like") return answer(tables.like(tableId));
        if (action === "say") return setSaying("");
        if (action === "rematch") {
          const pending = view.board?.pending;
          const theirs = pending?.kind === "rematch" && (pending as { by?: number }).by !== view.seat;
          return answer(theirs ? tables.answer(tableId, pending!.id, "accept") : tables.propose(tableId, "rematch"));
        }
      },
    }),
    said ? h(Text, { color: "red" }, said) : null,
  );
}

// Setting a table (C2): the class, its set, the seats and an optional name,
// at the person's own point and circle. The name goes through the queue like
// a phrase; the table stands without it meanwhile (§6.1). The author sits at
// once and stands up from any table they sat at before (POST /tables).
const CLASSES = ["dots", "grid", "free", "deck", "dice", "word", "physics"] as const;
// Sets the engines read: dots its field's size (lib/tables_dots.ts), grid
// chess or anything else as checkers (lib/tables_grid.ts); the other engines
// read none, and the node takes any set of 1–40 characters.
const SETS: Record<string, string[]> = { dots: ["4x4", "2x2", "3x3", "5x5", "6x6", "7x7", "8x8"], grid: ["checkers", "chess"] };
const setsOf = (kind: string) => SETS[kind] ?? [kind];
// The seats of each class, as the node refuses more (routes/tables.ts).
const MOST: Record<string, number> = { grid: 2, dots: 2, dice: 2, word: 2, free: 4, physics: 4, deck: 6 };
const seatsOf = (kind: string) => Array.from({ length: (MOST[kind] ?? 2) - 1 }, (_, i) => String(i + 2));
// 24 graphemes, as the node counts them: a slice by UTF-16 units split an
// emoji and the node stored U+FFFD (verifier, 2026-09-27).
const graphemes = (text: string, most: number) =>
  [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].slice(0, most).map((g) => g.segment).join("");
// The table's name is also held to 256 bytes (db/064: octet_length(name) <= 256):
// 24 family emoji are 600 and the node answered 503 (verifier, 2026-09-27).
const tableName = (text: string) => {
  let out = "";
  for (const g of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(graphemes(text, 24))) {
    if (new TextEncoder().encode(out + g.segment).length > 256) break;
    out += g.segment;
  }
  return out;
};

export function NewTable(
  { say, tables, place, onSet, onBack }: {
    say: Say;
    tables: Pick<Tables, "create">;
    place: { lat: number; lon: number; radius: 100 | 300 | 1000 | 3000 | 10000 };
    onSet: (tableId: string) => void;
    onBack: () => void;
  },
): ReactElement {
  const [kind, setKind] = useState<string>("dots");
  const [set, setSet] = useState<string>(setsOf("dots")[0]);
  const [seats, setSeats] = useState("2");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("table.new"), lines: [say("table.open")] }),
    h(Form, {
      fields: [
        { key: "class", label: say("table.class"), value: kind, choices: [...CLASSES] },
        { key: "set", label: say("table.set"), value: set, choices: setsOf(kind) },
        { key: "seats", label: say("table.seats"), value: seats, choices: seatsOf(kind) },
        { key: "name", label: say("table.name"), value: name },
      ],
      onChange: (key, value) => {
        if (key === "class") { setKind(value); setSet(setsOf(value)[0]); setSeats("2"); }
        if (key === "set") setSet(value);
        if (key === "seats") setSeats(value);
        if (key === "name") setName(tableName(value));
      },
      actions: [
        { key: "set", label: say("table.put"), disabled: busy },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (busy) return;
        setBusy(true);
        setError(null);
        tables.create({
          class: kind as BoardClass, set, seats: Number(seats), lat: place.lat, lon: place.lon, area_radius: place.radius,
          ...(name.trim() ? { name: name.trim() } : {}),
        }).then((a) => {
          if (a.status === 201) return onSet(a.body.id);
          const e = (a.body as unknown as { error?: { code?: string; message?: string } } | null)?.error;
          setError(`${say("table.refused")}: ${plain(e?.message ?? e?.code ?? a.status, 200)}`);
          setBusy(false);
        }).catch((e: Error) => { setError(e.message); setBusy(false); });
      },
    }),
    error ? h(Text, { color: "red" }, error) : null,
  );
}

// Seated elsewhere (C5): the node refused a seat with already_seated and named
// the table one sits at ({error: {code, table}}, xor-ad-8c). The terminal
// names it too and offers: back to it, or stand up there and sit down here.
export function SeatedElsewhere(
  { say, tables, there, here, onOpen, onBack, onError }: {
    say: Say;
    tables: Pick<Tables, "view" | "stand" | "sit">;
    there: string;
    here: string;
    onOpen: (tableId: string) => void;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    tables.view(there)
      .then((a) => setName(a.status === 200 ? `${plain(a.body.name ?? a.body.class, 48)}` : "?"))
      .catch((e: Error) => onError(e.message));
  }, [there]);
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("table.seatedElsewhere", { name: name ?? "…" }) }),
    h(Menu, {
      actions: [
        { key: "there", label: say("table.backThere") },
        { key: "move", label: say("table.standThere") },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (key === "there") return onOpen(there);
        const code = (a: { status: number; body: unknown }) =>
          plain((a.body as { error?: { code?: string } } | null)?.error?.code ?? a.status, 80);
        void (async () => {
          const stood = await tables.stand(there);
          if (stood.status >= 400) return onError(`${say("table.refused")}: ${code(stood)}`);
          const sat = await tables.sit(here);
          if (sat.status < 400) return onOpen(here);
          const back = await tables.sit(there);
          if (back.status < 400) {
            onError(`${say("table.refused")}: ${code(sat)} · ${say("table.keptThere")}`);
            return onOpen(there);
          }
          onError(`${say("table.refused")}: ${code(sat)} · ${say("table.lostBoth")}`);
        })().catch((e: Error) => onError(e.message));
      },
    }),
  );
}
