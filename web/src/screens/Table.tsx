// Screen 19 in the web face (G2; the terminal's §4.9; kit elements only, К6):
// the table as the node gives it, open to the node and said so, whose turn and
// how long, the score, the lines since one's own seating. The first class drawn
// is dots (G1c): a free edge is a button; the node keeps the rules.

import { useCallback, useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { applyFrame, dotsOf, frameNeedsView, openApplications, type TableView, Tables, turnOf } from "../../../depth/core/tables.ts";
import { say } from "../api/me.ts";
import { durationSeconds } from "../locales/duration.ts";
import { connectTable } from "../api/tableRoom.ts";
import { classWord, tableRefusal } from "../api/tables.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";
import { MoveInput } from "../ui/MoveInput.tsx";
import { Notice } from "../ui/Notices.tsx";
import { Pair, Pairs } from "../ui/Pair.tsx";
import { Screen } from "../ui/Screen.tsx";
import { CellsBoard, DeckBoard, DotsBoard, FreeBoard, WordBoard } from "./TableBoards.tsx";

// onBack (TB1, owner 11.10.2026: «"Назад" без вставания»): the header's arrow
// goes to the tabs and the seat stays the person's — the table waits in «Мои
// столы · сижу здесь» and opens from there. onLeave is for a table left behind:
// stood up from, or gone.
export function Table({ client, tableId, onLeave, onBack }: { client: Client; tableId: string; onLeave: () => void; onBack: () => void }) {
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

  if (!view) {
    return (
      <Screen name="table" title={say("table.title")} header={<HeaderScreen title={say("table.title")} onBack={onBack} backLabel={say("common.back")} />}>
        {error ? <ErrorLine>{error}</ErrorLine> : <p className="ui-hint">…</p>}
      </Screen>
    );
  }
  const turn = turnOf(view);
  const board = view.board;
  const nameOf = (seat: number) => view.seats.find((s) => s.seat === seat)?.name ?? `#${seat}`;
  const score = board ? view.seats.filter((s) => board.score[String(s.seat)] !== undefined) : [];
  // A game has begun when the board has a turn; before that (and after the end)
  // there is nothing to give up and the button proposes a game.
  const started = !!board && !board.over && board.turn !== null;
  const title = `${say("table.title")}${view.name ? ` · «${view.name}»` : ""} · ${classWord(view.class)}`;

  return (
    <Screen name="table" title={title} data-testid="table" data-id={tableId}
      header={<HeaderScreen title={title} onBack={onBack} backLabel={say("common.back")} action={<Info label={say("table.title")} data-testid="table-info"><p role="note">{say("table.open")}</p></Info>} />}>
      <p className="ui-hint">{say("table.playing")} {view.playing} · {say("table.watching")} {view.watching} · ♥ {view.like_count ?? 0}</p>
      <p className="ui-hint">{say("table.seated")}: {view.seats.map((s) => (s.seat === view.seat ? say("table.you") : s.name)).join(" · ")}</p>
      {/* The name the moderator refused (W13-TN, §6.1): the table lives on without one. */}
      {view.name_refused && <Notice data-testid="table-name-refused">{say("table.nameRefused")}</Notice>}
      {!board || board.over
        ? <p data-testid="over">{say("table.over")}</p>
        : board.turn === null ? <p data-testid="turn">{say("table.notStarted")}</p>
        : <p data-testid="turn">{turn.mine ? say("table.yourTurn") : `${say("table.turn")}: ${turn.name ?? "—"}`} · {durationSeconds(turn.secondsLeft)}</p>}
      {score.length > 0 && (
        // Whose number is which: a pair «имя — число», not the bare numbers (П13).
        <section data-testid="score" aria-label={say("table.score")}>
          <Pairs>
            {score.map((s) => <Pair key={s.seat} label={s.seat === view.seat ? say("table.you") : s.name}>{board!.score[String(s.seat)]}</Pair>)}
          </Pairs>
        </section>
      )}
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
      {error && <ErrorLine>{error}</ErrorLine>}
      <ul className="ui-lines">
        {view.lines.filter((l) => l.kind !== "move").map((l) => (
          <li key={l.id}>{nameOf(l.seat)} — {l.kind === "sticker" ? `[${l.sticker}]` : l.text}</li>
        ))}
        {openApplications(view).map((l) => <li key={`w${l.id}`}>{say("table.application")}: {nameOf(l.seat)}</li>)}
      </ul>
      <MoveInput
        legend={say("table.say")}
        fields={[{ label: say("web.table.line"), value: line, onChange: setLine, maxLength: 128, testid: "line-input" }]}
        submit={{ label: say("table.say"), icon: "say", testid: "line-send" }}
        onSubmit={() => { const text = line.trim(); if (text) void act(() => tables.say(tableId, { kind: "line", text })).then(() => setLine("")); }}
        /* A watcher asks to play with a line of their own (W15): the words are
           theirs, the kind is an application (§6.1). */
        extra={!view.is_playing && (
          <Button kind="secondary" type="button" icon="queue" aria-label={say("table.application")} disabled={!line.trim()} data-testid="apply"
            onClick={() => { const text = line.trim(); if (text) void act(() => tables.say(tableId, { kind: "application", text })).then(() => setLine("")); }} />
        )}
      />
      {/* A game begins by a proposal (W15): a player alone starts it at once and
          takes the applicants in; with others playing, each has to agree. After
          an end the same button is «ещё партию» (П13). */}
      {view.is_playing && (() => {
        const pending = board?.pending as { id: string; by?: number; answers?: Record<string, string> } | null | undefined;
        if (pending) {
          if (pending.by === view.seat || pending.answers?.[String(view.seat)] === "accept") {
            return <p className="ui-hint" data-testid="pending">{say("web.table.waitingAnswers")}</p>;
          }
          return (
            <div data-testid="pending">
              <p>{say("web.table.proposed", { name: nameOf(pending.by ?? 0) })}</p>
              <div className="ui-actions">
                <Button kind="primary" type="button" icon="check" aria-label={say("web.table.accept")} data-testid="accept-game" onClick={() => act(() => tables.answer(tableId, pending.id, "accept"))} />
                <Button kind="secondary" type="button" icon="close" aria-label={say("web.table.decline")} data-testid="decline-game" onClick={() => act(() => tables.answer(tableId, pending.id, "decline"))} />
              </div>
            </div>
          );
        }
        if (!started) {
          const label = !board || board.over ? say("web.game.rematch") : say("web.table.start");
          return <Button kind="primary" type="button" icon="watch" className="ui-wide" aria-label={label} data-testid="start-game" onClick={() => act(() => tables.propose(tableId, "rematch"))} />;
        }
        return null;
      })()}
      <div className="ui-icon-row">
        {turn.mine && board && <Button kind="secondary" icon="pass" aria-label={say("table.pass")} onClick={() => act(() => tables.pass(tableId, board.seq))} />}
        {view.is_playing && started && <Button kind="secondary" icon="giveup" aria-label={say("table.resign")} data-testid="resign" onClick={() => act(() => tables.resign(tableId))} />}
        <Button kind="secondary" icon="like" aria-label={say("table.like")} onClick={() => act(() => tables.like(tableId))} />
        <Button kind="secondary" icon="leave" aria-label={say("table.stand")} data-testid="table-stand" onClick={() => act(async () => { const answer = await tables.stand(tableId); if (answer.status < 400) onLeave(); return answer; })} />
      </div>
    </Screen>
  );
}
