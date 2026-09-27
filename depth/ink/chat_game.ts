// A game in the chat (GC2; protocol §4.7, chat spec §6, screen 18): proposed
// by one side, accepted by the other, played on the tables' boards. The
// conversation's room brings `board` and `proposal` frames; this screen reads
// the game again on each (`tick`), since the view is cut for this side and a
// frame is only the word that something moved.
//
// Dots are drawn here as the table draws them (core drawDots, [ and ] walk the
// free edges); the other classes by the table's boards (table_boards.ts),
// from the chat's view made into a table's (core asTableView).
import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Say } from "./strings.ts";
import { Menu, plain, useKeys } from "./parts.ts";
import { Board } from "./table_boards.ts";
import { dotsOf, drawDots, freeEdges, type BoardClass } from "../core/tables.ts";
import { asTableView, type ChatGames, type ChatGameView, chatTurn } from "../core/chat_games.ts";

// The classes and the sets the engines read, as the table's setting screen
// offers them (ink/table.ts CLASSES, SETS): dots its field, grid chess or
// checkers; the others take their own name.
const CLASSES: BoardClass[] = ["dots", "grid", "free", "deck", "dice", "word", "physics"];
const SET_OF: Record<string, string> = { dots: "4x4", grid: "checkers" };

export function ChatGame(
  { say, games, chatId, name, tick, active, onClose, onError }: {
    say: Say;
    games: Pick<ChatGames, "view" | "propose" | "answer" | "move" | "rematch" | "answerRematch" | "resign">;
    chatId: string;
    // The other side's name, as the chat shows it.
    name: string;
    // Moves on every board or proposal frame of the room: read the game again.
    tick: number;
    active: boolean;
    onClose: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [view, setView] = useState<ChatGameView | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const load = () =>
    games.view(chatId)
      .then((a) => setView(a.status === 200 ? a.body : null))
      .catch((e: Error) => onError(e.message));
  useEffect(() => void load(), [chatId, tick]);

  const board = view?.board ?? null;
  const turn = view ? chatTurn(view) : null;
  const dots = dotsOf(board);
  const free = dots ? freeEdges(dots) : [];
  const [at, setAt] = useState(0);
  const edge = free.length ? free[Math.min(at, free.length - 1)] : undefined;
  // The other classes' boards have controls of their own: tab hands the
  // arrows between the board and the menu, as on the table's screen.
  const [wantBoard, setWantBoard] = useState(false);
  const other = !!board && !dots && turn === "mine";
  const onBoard = wantBoard && other;
  useKeys((input, key) => {
    if (active && other && key.tab) return setWantBoard(!onBoard);
    if (!active || !free.length) return;
    if (input === "]") setAt((i) => (Math.min(i, free.length - 1) + 1) % free.length);
    if (input === "[") setAt((i) => (Math.min(i, free.length - 1) - 1 + free.length) % free.length);
  });

  // A refusal comes back as a line of text; a move answered 200 is the new view.
  const refused = (a: { status: number; body: unknown }) => {
    const e = (a.body as { error?: { code?: string; reason?: string } } | null)?.error;
    setNote(`${say("table.refused")}: ${plain(e?.reason ?? e?.code ?? a.status, 120)}`);
  };
  const move = (m: unknown) => {
    if (!board) return;
    setNote(null);
    games.move(chatId, board.seq, m)
      .then((a) => (a.status === 200 ? setView(a.body) : (refused(a), load())))
      .catch((e: Error) => onError(e.message));
  };
  const act = (p: Promise<{ status: number; body: unknown }>) =>
    p.then((a) => (a.status >= 400 ? refused(a) : setNote(null))).then(load).catch((e: Error) => onError(e.message));

  const pending = view?.pending ?? null;
  const theirs = pending && !pending.mine ? pending : null;
  const head = h(Text, { bold: true }, `${say("game.title")} · ${plain(name, 48)}`);

  // No game yet: propose one — the class picked here, its usual set.
  if (view === undefined) return h(Box, { flexDirection: "column" }, head, h(Text, { dimColor: true }, "…"));
  if (view === null || (!board && !pending)) {
    return h(
      Box,
      { flexDirection: "column" },
      head,
      h(Text, { dimColor: true }, say("game.none")),
      h(Menu, {
        active,
        actions: [...CLASSES.map((c) => ({ key: c, label: c })), { key: "close", label: say("common.close") }],
        onPick: (key) =>
          key === "close" ? onClose() : act(games.propose(chatId, key as BoardClass, SET_OF[key] ?? key)),
      }),
      note ? h(Text, { color: "red" }, note) : null,
    );
  }

  const tv = asTableView(chatId, view, { mine: say("table.you"), theirs: plain(name, 48) });
  const score = board ? [1, 2].map((s) => `${s === view.your_seat ? say("table.you") : plain(name, 48)} ${board.score[String(s)] ?? 0}`).join(" · ") : "";
  const status = !board
    ? pending?.mine ? say("game.waiting") : say("game.offered", { game: plain(pending?.class ?? "", 12) })
    : board.over ? say("table.over")
    : turn === "mine" ? say("table.yourTurn")
    : say("game.theirTurn", { name: plain(name, 48) });
  const actions = [
    ...(theirs ? [{ key: "accept", label: say("game.accept") }, { key: "decline", label: say("game.decline") }] : []),
    ...(dots && board ? [{ key: "edge", label: `${say("table.move")} ${edge ?? ""}`, disabled: turn !== "mine" || !edge }] : []),
    ...(board && !board.over ? [{ key: "resign", label: say("table.resign") }] : []),
    ...(board && board.over && !pending ? [{ key: "rematch", label: say("table.rematch") }] : []),
    { key: "close", label: say("common.close") },
  ];
  return h(
    Box,
    { flexDirection: "column" },
    head,
    h(Text, { color: turn === "mine" ? "green" : undefined }, `${plain(view.class, 12)} · ${status}`),
    score ? h(Text, null, `${say("table.score")}: ${score}`) : null,
    ...(dots ? drawDots(dots, turn === "mine" ? edge : undefined).map((row, i) => h(Text, { key: `d${i}` }, row)) : []),
    board && !dots ? h(Board, { say, view: tv, onMove: turn === "mine" ? move : undefined, active: active && onBoard }) : null,
    h(Menu, {
      active: active && !onBoard,
      actions,
      onPick: (key) => {
        if (key === "close") return onClose();
        if (key === "edge" && edge) return move({ edge });
        if (key === "resign") return act(games.resign(chatId));
        if (key === "rematch") return act(games.rematch(chatId));
        if (!theirs) return;
        if (theirs.kind === "rematch") return act(games.answerRematch(chatId, theirs.id, key === "accept" ? "accept" : "decline"));
        return act(games.answer(chatId, key === "accept" ? "accept" : "decline"));
      },
      hint: dots ? `[ ] ${say("table.edge")} · ${say("common.rowActions")}`
        : other ? `tab ${say("table.toBoard")} · ${say("common.rowActions")}` : say("common.rowActions"),
    }),
    note ? h(Text, { color: "red" }, note) : null,
  );
}
