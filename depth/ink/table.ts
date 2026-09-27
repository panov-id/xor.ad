// The table (docs/depth-client_RU.md §4.9; G2): the board as the node gives
// it, who sits, whose turn and how long, the lines since one's own seating.
// Said aloud, as §4.9 asks: no end-to-end encryption here, and a line waits
// for the moderation queue like a phrase. The board lives in the process only.
import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Say } from "./strings.ts";
import { Head, Menu, useKeys } from "./parts.ts";
import type { Room } from "../core/client.ts";
import {
  applyFrame, dotsOf, drawDots, frameNeedsView, freeEdges, openApplications, SEAT_LOST, type Tables, type TableView, turnOf,
} from "../core/tables.ts";

export type TableAction = "move" | "pass" | "say" | "stand" | "resign" | "like";

export function Table(
  { say, view, onPick, onMove, now }: {
    say: Say; view: TableView; onPick: (action: TableAction) => void; onMove?: (move: unknown) => void; now?: number;
  },
): ReactElement {
  const turn = turnOf(view, now);
  const board = view.board;
  const counts = `${say("table.playing")} ${view.playing} · ${say("table.watching")} ${view.watching} · ♥ ${view.like_count ?? 0}`;
  const seated = view.seats.map((s) => (s.seat === view.seat ? say("table.you") : s.name)
    + (s.hand_count !== undefined ? ` · ${s.hand_count}` : "")).join(" · ");
  const score = board
    ? view.seats.filter((s) => board.score[String(s.seat)] !== undefined).map((s) => `${s.name} ${board.score[String(s.seat)]}`).join(" · ")
    : "";
  const moves = board?.state.moves ?? [];
  const nameOf = (seat: number) => view.seats.find((s) => s.seat === seat)?.name ?? `#${seat}`;
  const waiting = openApplications(view);
  // Dots (G1c): [ and ] walk the free edges, the marked one goes on "move".
  const dots = dotsOf(board);
  const free = dots ? freeEdges(dots) : [];
  const [at, setAt] = useState(0);
  const edge = free.length ? free[Math.min(at, free.length - 1)] : undefined;
  useKeys((input) => {
    if (!free.length) return;
    if (input === "]") setAt((i) => (Math.min(i, free.length - 1) + 1) % free.length);
    if (input === "[") setAt((i) => (Math.min(i, free.length - 1) - 1 + free.length) % free.length);
  });
  const actions: Array<{ key: TableAction; label: string; disabled?: boolean }> = [
    ...(dots ? [{ key: "move" as const, label: `${say("table.move")} ${edge ?? ""}`, disabled: !turn.mine || !edge }] : []),
    { key: "pass", label: say("table.pass"), disabled: !turn.mine },
    { key: "say", label: say("table.say") },
    { key: "resign", label: say("table.resign"), disabled: !view.is_playing || !board || !!board.over },
    { key: "like", label: say("table.like") },
    { key: "stand", label: say("table.stand") },
  ];
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, {
      title: `${say("table.title")}${view.name ? ` · "${view.name}"` : ""} · ${view.class}`,
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
          : `${say("table.turn")}: ${turn.name ?? "—"} · ${turn.secondsLeft} ${say("table.seconds")}`),
        score ? h(Text, null, `${say("table.score")}: ${score}`) : null,
        ...(dots ? drawDots(dots, turn.mine ? edge : undefined).map((row, i) => h(Text, { key: `d${i}` }, row)) : []),
        ...moves.slice(-5).map((m, i) =>
          h(Text, { key: `m${i}`, dimColor: true }, `${nameOf(m.seat)}  ${m.pass ? say("table.passed") : JSON.stringify(m.move)}`)
        ),
      ),
    h(
      Box,
      { flexDirection: "column" },
      ...view.lines.filter((l) => l.kind !== "move").slice(-6).map((l) =>
        h(Text, { key: l.id }, `${nameOf(l.seat)}  ${l.kind === "sticker" ? `[${l.sticker}]` : l.text ?? ""}`)
      ),
      ...waiting.map((l) => h(Text, { key: `w${l.id}`, color: "yellow" }, `${say("table.application")}: ${nameOf(l.seat)}`)),
    ),
    h(Menu, {
      actions,
      onPick: (key) => key === "move" && edge ? onMove?.({ edge }) : onPick(key as TableAction),
      hint: dots ? `[ ] ${say("table.edge")} · ${say("common.rowActions")}` : say("common.rowActions"),
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
    tables: Pick<Tables, "view" | "move" | "pass" | "stand" | "resign" | "like">;
    open: (tableId: string) => Promise<Room>;
    tableId: string;
    onLeave: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [view, setView] = useState<TableView | null>(null);
  const [said, setSaid] = useState<string | null>(null);
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
      setSaid(a.status >= 400 ? `${say("table.refused")}: ${error?.reason ?? error?.code ?? a.status}` : null);
    }).catch((e: Error) => onError(e.message));
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
      },
    }),
    said ? h(Text, { color: "red" }, said) : null,
  );
}
