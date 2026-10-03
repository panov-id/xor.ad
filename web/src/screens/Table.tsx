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
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import "./place.css";
import { CellsBoard, DeckBoard, DotsBoard, FreeBoard, WordBoard } from "./TableBoards.tsx";
import { Info } from "../ui/Info.tsx";

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

  if (!view) return <main className="screen table"><p className="place-meta">{error ?? "…"}</p></main>;
  const turn = turnOf(view);
  const board = view.board;
  const nameOf = (seat: number) => view.seats.find((s) => s.seat === seat)?.name ?? `#${seat}`;
  const score = board ? view.seats.filter((s) => board.score[String(s.seat)] !== undefined) : [];

  return (
    <main className="screen table" data-testid="table" data-id={tableId}>
      <HeaderScreen title={`${say("table.title")}${view.name ? ` · «${view.name}»` : ""} · ${view.class}`}
        action={<Info label={say("table.title")} data-testid="table-info"><p role="note">{say("table.open")}</p></Info>} />
      <header className="place-table-head">
        <p>{say("table.playing")} {view.playing} · {say("table.watching")} {view.watching} · ♥ {view.like_count ?? 0}</p>
        <p>{say("table.seated")}: {view.seats.map((s) => (s.seat === view.seat ? say("table.you") : s.name)).join(" · ")}</p>
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
      {error && <p role="alert" className="error">{error}</p>}
      <ul className="place-lines">
        {view.lines.filter((l) => l.kind !== "move").map((l) => (
          <li key={l.id}>{nameOf(l.seat)} — {l.kind === "sticker" ? `[${l.sticker}]` : l.text}</li>
        ))}
        {openApplications(view).map((l) => <li key={`w${l.id}`} className="application">{say("table.application")}: {nameOf(l.seat)}</li>)}
      </ul>
      <form className="place-say" onSubmit={(e) => { e.preventDefault(); const text = line.trim(); if (text) void act(() => tables.say(tableId, { kind: "line", text })).then(() => setLine("")); }}>
        <input value={line} maxLength={128} onChange={(e) => setLine(e.target.value)} aria-label={say("table.say")} data-testid="line-input" />
        <Button kind="primary" type="submit" icon="say" className="ui-mid" aria-label={say("table.say")} data-testid="line-send" />
        {/* A watcher asks to play with a line of their own (W15): the words are
            theirs, the kind is an application (§6.1). */}
        {!view.is_playing && (
          <Button kind="secondary" type="button" icon="queue" className="ui-mid" aria-label={say("table.application")} disabled={!line.trim()} data-testid="apply"
            onClick={() => { const text = line.trim(); if (text) void act(() => tables.say(tableId, { kind: "application", text })).then(() => setLine("")); }} />
        )}
      </form>
      {/* A game begins by a proposal (W15): a player alone starts it at once and
          takes the applicants in; with others playing, each has to agree. */}
      {view.is_playing && (() => {
        const pending = board?.pending as { id: string; by?: number; answers?: Record<string, string> } | null | undefined;
        if (pending) {
          if (pending.by === view.seat || pending.answers?.[String(view.seat)] === "accept") {
            return <p className="muted" data-testid="pending">{say("web.table.waitingAnswers")}</p>;
          }
          return (
            <p className="place-actions" data-testid="pending">
              {say("web.table.proposed", { name: nameOf(pending.by ?? 0) })}{" "}
              <Button kind="primary" type="button" icon="check" aria-label={say("web.table.accept")} data-testid="accept-game" onClick={() => act(() => tables.answer(tableId, pending.id, "accept"))} />
              <Button kind="secondary" type="button" icon="close" aria-label={say("web.table.decline")} data-testid="decline-game" onClick={() => act(() => tables.answer(tableId, pending.id, "decline"))} />
            </p>
          );
        }
        if (!board || board.over || board.turn === null) {
          return <Button kind="primary" type="button" icon="watch" className="ui-wide" aria-label={say("web.table.start")} data-testid="start-game" onClick={() => act(() => tables.propose(tableId, "rematch"))} />;
        }
        return null;
      })()}
      <nav className="place-actions ui-icon-row">
        {turn.mine && board && <Button kind="secondary" icon="pass" aria-label={say("table.pass")} onClick={() => act(() => tables.pass(tableId, board.seq))} />}
        {view.is_playing && board && !board.over && <Button kind="secondary" icon="giveup" aria-label={say("table.resign")} onClick={() => act(() => tables.resign(tableId))} />}
        <Button kind="secondary" icon="like" aria-label={say("table.like")} onClick={() => act(() => tables.like(tableId))} />
        <Button kind="secondary" icon="leave" aria-label={say("table.stand")} onClick={() => act(async () => { const answer = await tables.stand(tableId); if (answer.status < 400) onLeave(); return answer; })} />
      </nav>
    </main>
  );
}
