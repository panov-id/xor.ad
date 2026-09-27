// The table (docs/depth-client_RU.md §4.9; G2): the board as the node gives
// it, who sits, whose turn and how long, the lines since one's own seating.
// Said aloud, as §4.9 asks: no end-to-end encryption here, and a line waits
// for the moderation queue like a phrase. The board lives in the process only.
import { createElement as h } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Say } from "./strings.ts";
import { Head, Menu } from "./parts.ts";
import { openApplications, type TableView, turnOf } from "../core/tables.ts";

export type TableAction = "pass" | "say" | "stand" | "resign" | "like";

export function Table(
  { say, view, onPick, now }: { say: Say; view: TableView; onPick: (action: TableAction) => void; now?: number },
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
  const actions: Array<{ key: TableAction; label: string; disabled?: boolean }> = [
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
          : turn.mine ? `${say("table.yourTurn")} · ${turn.secondsLeft} ${say("table.seconds")}`
          : `${say("table.turn")}: ${turn.name ?? "—"} · ${turn.secondsLeft} ${say("table.seconds")}`),
        score ? h(Text, null, `${say("table.score")}: ${score}`) : null,
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
    h(Menu, { actions, onPick: (key) => onPick(key as TableAction), hint: say("common.rowActions") }),
  );
}
