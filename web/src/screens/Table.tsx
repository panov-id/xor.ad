// Screen 19 in the web face (G2; the terminal's §4.9): the table as the node
// gives it, open to the node and said so, whose turn and how long, the score,
// the lines since one's own seating. The first class drawn is dots (G1c): a
// free edge is a button; the node keeps the rules.

import { useCallback, useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { applyFrame, dotsOf, frameNeedsView, openApplications, type TableView, Tables, turnOf } from "../../../depth/core/tables.ts";
import { say } from "../api/me.ts";
import { connectTable } from "../api/tableRoom.ts";
import { tableRefusal } from "../api/tables.ts";
import { CellsBoard, DeckBoard, DotsBoard, FreeBoard, WordBoard } from "./TableBoards.tsx";

export function Table({ client, tableId, onLeave }: { client: Client; tableId: string; onLeave: () => void }) {
  const [tables] = useState(() => new Tables(client));
  const [view, setView] = useState<TableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState("");
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    // A read that throws (locked, no network) is said, not dropped.
    try {
      const answer = await tables.view(tableId);
      if (answer.status === 200) setView(answer.body);
      else setError(tableRefusal(answer));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tables, tableId]);

  // The table's socket (C1): the view read once, then each frame laid on it;
  // a board or seat frame changes who plays, which only the table read whole
  // says, so it reads the table again (depth/core frameNeedsView). A reconnect
  // reads it whole too — frames missed meanwhile are not replayed. The clock
  // ticks between frames.
  useEffect(() => {
    void load();
    const room = connectTable(client, tableId, (event) => {
      if (event.kind === "connected") return void load();
      if (event.kind === "gone") return onLeave();
      if (event.kind !== "frame") return;
      setView((v) => (v ? applyFrame(v, event.frame) : v));
      if (frameNeedsView(event.frame)) void load();
    });
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => { room.stop(); clearInterval(clock); };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(run: () => Promise<{ status: number; body: unknown }>) {
    setError(null);
    try {
      const refused = tableRefusal(await run() as never);
      if (refused) setError(refused);
    } catch (e) {
      setError((e as Error).message);
    }
    await load();
  }

  if (!view) return <main className="table"><p>{error ?? "…"}</p></main>;
  const turn = turnOf(view);
  const board = view.board;
  const nameOf = (seat: number) => view.seats.find((s) => s.seat === seat)?.name ?? `#${seat}`;
  const score = board ? view.seats.filter((s) => board.score[String(s.seat)] !== undefined) : [];

  return (
    <main className="table" data-testid="table">
      <header>
        <h1>{say("table.title")}{view.name ? ` · «${view.name}»` : ""} · {view.class}</h1>
        <p>{say("table.playing")} {view.playing} · {say("table.watching")} {view.watching} · ♥ {view.like_count ?? 0}</p>
        <p>{say("table.seated")}: {view.seats.map((s) => (s.seat === view.seat ? say("table.you") : s.name)).join(" · ")}</p>
        <p role="note">{say("table.open")}</p>
      </header>
      {!board || board.over
        ? <p data-testid="over">{say("table.over")}</p>
        : board.turn === null ? <p data-testid="turn">{say("table.notStarted")}</p>
        : <p data-testid="turn">{turn.mine ? say("table.yourTurn") : `${say("table.turn")}: ${turn.name ?? "—"}`} · {turn.secondsLeft} {say("table.seconds")}</p>}
      {score.length > 0 && <p data-testid="score">{say("table.score")}: {score.map((s) => `${s.name} ${board!.score[String(s.seat)]}`).join(" · ")}</p>}
      {dotsOf(board) && (
        <DotsBoard view={view} onEdge={turn.mine ? (edge) => act(() => tables.move(tableId, board!.seq, { edge })) : undefined} />
      )}
      {board && !board.over && (() => {
        // The other classes (W12): each board reads its own part of the
        // state; a move goes on the board it was made on, and only in turn.
        const onMove = turn.mine ? (m: unknown) => void act(() => tables.move(tableId, board.seq, m)) : undefined;
        return (
          <>
            <DeckBoard view={view} onMove={onMove} />
            <WordBoard view={view} onMove={onMove} />
            <FreeBoard view={view} onMove={onMove} />
            <CellsBoard view={view} onMove={onMove} />
          </>
        );
      })()}
      {error && <p role="alert">{error}</p>}
      <ul className="lines">
        {view.lines.filter((l) => l.kind !== "move").map((l) => (
          <li key={l.id}>{nameOf(l.seat)} — {l.kind === "sticker" ? `[${l.sticker}]` : l.text}</li>
        ))}
        {openApplications(view).map((l) => <li key={`w${l.id}`} className="application">{say("table.application")}: {nameOf(l.seat)}</li>)}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); const text = line.trim(); if (text) void act(() => tables.say(tableId, { kind: "line", text })).then(() => setLine("")); }}>
        <input value={line} maxLength={128} onChange={(e) => setLine(e.target.value)} aria-label={say("table.say")} />
        <button type="submit">{say("table.say")}</button>
      </form>
      <nav>
        {turn.mine && board && <button onClick={() => act(() => tables.pass(tableId, board.seq))}>{say("table.pass")}</button>}
        {view.is_playing && board && !board.over && <button onClick={() => act(() => tables.resign(tableId))}>{say("table.resign")}</button>}
        <button onClick={() => act(() => tables.like(tableId))}>{say("table.like")}</button>
        <button onClick={() => act(async () => { const answer = await tables.stand(tableId); if (answer.status < 400) onLeave(); return answer; })}>{say("table.stand")}</button>
      </nav>
    </main>
  );
}
