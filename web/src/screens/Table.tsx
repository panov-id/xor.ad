// Screen 19 in the web face (G2; the terminal's §4.9; kit elements only, К6):
// the table as the node gives it, open to the node and said so, whose turn and
// how long, the score, the lines since one's own seating. The first class drawn
// is dots (G1c): a free edge is a button; the node keeps the rules.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { applyFrame, dotsOf, frameNeedsView, openApplications, type TableView, Tables, turnOf } from "../../../depth/core/tables.ts";
import { say } from "../api/me.ts";
import { LikeCount } from "../ui/Card.tsx";
import { BoardPanel, type PanelSeat, type PanelTurn } from "../ui/BoardPanel.tsx";
import { ActionSheet, type SheetAction } from "../ui/Sheet.tsx";
import { Split } from "../ui/Split.tsx";
import { TileFoot } from "../ui/TileFoot.tsx";
import { durationSeconds } from "../locales/duration.ts";
import { connectTable } from "../api/tableRoom.ts";
import { classWord, tableRefusal } from "../api/tables.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { MessageInput } from "../ui/MessageInput.tsx";
import { MoveInput } from "../ui/MoveInput.tsx";
import { Notice } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";
import { STICKERS, Sticker } from "../ui/Sticker.tsx";
import { CellsBoard, DeckBoard, DotsBoard, FreeBoard, PokerBoard, SeaBoard, WordBoard } from "./TableBoards.tsx";
import "./talk.css";

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
  const [more, setMore] = useState(false);
  // «say» (sheets adaptive-*-table-393, *-table-sticker-393): the strip of eight opens under the board.
  const [saying, setSaying] = useState(false);
  // A sticker said at the table lands on its sender's score for 4 s (sheet adaptive-*-table-sticker-393);
  // the lines already there when the table opens do not land again.
  const [landed, setLanded] = useState<{ seat: number; sticker: string; id: string } | null>(null);
  const seen = useRef<Set<string> | null>(null);

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

  useEffect(() => {
    if (!view) return;
    const stickers = view.lines.filter((l) => l.kind === "sticker" && l.sticker);
    if (seen.current === null) { seen.current = new Set(stickers.map((l) => String(l.id))); return; }
    const fresh = stickers.filter((l) => !seen.current!.has(String(l.id)));
    if (!fresh.length) return;
    for (const l of fresh) seen.current.add(String(l.id));
    const l = fresh[fresh.length - 1];
    const key = String(l.id);
    setLanded({ seat: l.seat, sticker: l.sticker!, id: key });
    // Not cleared with the effect: the view changes again within the 4 s (each frame), and the landing stays.
    setTimeout(() => setLanded((v) => (v?.id === key ? null : v)), 4000);
  }, [view]);

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
  // A seat is its name — «вы» for one's own — and, once the game has a score, its number (П13).
  const seats: PanelSeat[] = view.seats.map((s) => ({
    seat: s.seat,
    name: s.seat === view.seat ? say("table.you") : s.name,
    score: board && board.score[String(s.seat)] !== undefined ? board.score[String(s.seat)] : undefined,
  }));
  // A game has begun when the board has a turn; before that (and after the end)
  // there is nothing to give up and the button proposes a game.
  const started = !!board && !board.over && board.turn !== null;
  const title = `${say("table.title")}${view.name ? ` · «${view.name}»` : ""} · ${classWord(view.class)}`;
  const panelTurn: PanelTurn = !board || board.over
    ? { testid: "over", text: say("table.over") }
    : board.turn === null ? { testid: "turn", text: say("table.notStarted") }
    : { testid: "turn", mine: turn.mine, text: turn.mine ? say("table.yourTurn") : `${say("table.turn")}: ${turn.name ?? "—"}`, time: durationSeconds(turn.secondsLeft) };

  // A game begins by a proposal (W15): a player alone starts it at once and
  // takes the applicants in; with others playing, each has to agree. After
  // an end the same button is «ещё партию» (П13).
  const pending = board?.pending as { id: string; by?: number; answers?: Record<string, string> } | null | undefined;
  const answered = !!pending && (pending.by === view.seat || pending.answers?.[String(view.seat)] === "accept");
  const proposed = view.is_playing && !!pending && !answered;
  const canStart = view.is_playing && !pending && !started;
  const canPass = turn.mine && !!board && started;
  const like = () => act(() => tables.like(tableId));
  const pass = () => act(() => tables.pass(tableId, board!.seq));
  // The two main actions (SplitAction): what the table asks next — begin, again, pass — or the like when
  // nothing is asked, and standing up. The rest (give up, and what the first slot did not take) is behind «…».
  const sheet: SheetAction[] = [];
  // A game under way: the foot is «leave · say» (sheet adaptive-*-table-393); passing and the like are behind «…».
  const first = canStart ? "start" : view.is_playing && started ? "say" : canPass ? "pass" : "like";
  if (first !== "pass" && canPass) sheet.push({ id: "pass", label: say("table.pass"), onSelect: () => void pass(), testid: "pass" });
  if (view.is_playing && started) sheet.push({ id: "resign", label: say("table.resign"), onSelect: () => void act(() => tables.resign(tableId)), testid: "resign" });
  if (first !== "like") sheet.push({ id: "like", label: say("table.like"), onSelect: () => void like(), testid: "like" });
  const stand = <Button kind={first === "say" ? "primary" : "secondary"} type="button" icon="leave" aria-label={say("table.stand")} data-testid="table-stand" onClick={() => act(async () => { const answer = await tables.stand(tableId); if (answer.status < 400) onLeave(); return answer; })} />;

  return (
    <Screen name="table" title={title} data-testid="table" data-id={tableId}
      header={<HeaderScreen title={title} onBack={onBack} backLabel={say("common.back")} action={<Button type="button" icon="more" aria-label={say("web.chat.more")} aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore(true)} data-testid="table-more" />} />}>
      <ActionSheet open={more} title={say("web.chat.more")} actions={sheet} onClose={() => setMore(false)} data-testid="table-menu">
        <p role="note" className="ui-hint" data-testid="table-info">{say("table.open")}</p>
        <TileFoot items={[
          { icon: "player", n: view.playing, label: `${say("table.playing")} ${view.playing}` },
          { icon: "eye", n: view.watching, label: `${say("table.watching")} ${view.watching}` },
        ]}><LikeCount n={view.like_count ?? 0} /></TileFoot>
      </ActionSheet>
      {/* The name the moderator refused (W13-TN, §6.1): the table lives on without one. */}
      {view.name_refused && <Notice data-testid="table-name-refused">{say("table.nameRefused")}</Notice>}
      <BoardPanel seats={seats} seatedLabel={say("table.seated")} turn={panelTurn}
        landed={landed ? { seat: landed.seat, node: <span data-testid="landed" data-part="landed" role="img" aria-label={`${nameOf(landed.seat)} — ${say(`web.sticker.${landed.sticker}`)}`}><Sticker id={landed.sticker} size={46} /></span> } : undefined}>
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
              <SeaBoard view={view} onMove={onMove} />
              <PokerBoard view={view} onMove={onMove} />
            </>
          );
        })()}
      </BoardPanel>
      {/* The eight sticker reactions in one strip under the board (sheet adaptive-*-table-sticker-*):
          one tap says one at the table, open to the node as the lines are (§6.1, 30.08.2026). */}
      {saying && (
        <div role="group" aria-label={say("web.sticker.title")} data-part="stickers" data-testid="stickers">
          {STICKERS.map((id) => (
            <button key={id} type="button" aria-label={say(`web.sticker.${id}`)} data-testid={`sticker-${id}`}
              onClick={() => void act(() => tables.say(tableId, { kind: "sticker", sticker: id }))}>
              <Sticker id={id} size={36} />
            </button>
          ))}
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
      <ul className="ui-lines">
        {/* An application is said once, as «заявка: имя — слова», and only while
            it is open: once the applicant plays (or is refused) it goes, instead
            of «Борис — сыграю» hanging on after the game (walkthrough 11.10, С9). */}
        {view.lines.filter((l) => l.kind !== "move" && l.kind !== "application").map((l) => (
          <li key={l.id} data-testid="line" data-kind={l.kind}>{nameOf(l.seat)} — {l.kind === "sticker" && l.sticker ? say(`web.sticker.${l.sticker}`) : l.text}</li>
        ))}
        {openApplications(view).map((l) => <li key={`w${l.id}`} data-testid="application">{say("table.application")}: {nameOf(l.seat)}{l.text ? ` — ${l.text}` : ""}</li>)}
      </ul>
      {/* Free text at the table for the players (owner 14.10.2026: back next to «say», the stickers stay):
          one line with its send, as the conversation's (sheet adaptive-*-table-393). */}
      {view.is_playing && (
        <MessageInput label={say("web.table.line")} placeholder={say("web.chat.line")} sendLabel={say("table.say")} maxLength={128}
          value={line} onChange={setLine} inputTestId="line-input" sendTestId="line-send"
          onSend={(text) => void act(() => tables.say(tableId, { kind: "line", text })).then(() => setLine(""))} />
      )}
      {!view.is_playing && <MoveInput
        legend={say("table.say")}
        fields={[{ label: say("web.table.line"), value: line, onChange: setLine, maxLength: 128, testid: "line-input" }]}
        submit={{ label: say("table.say"), icon: "say", testid: "line-send" }}
        onSubmit={() => { const text = line.trim(); if (text) void act(() => tables.say(tableId, { kind: "line", text })).then(() => setLine("")); }}
        /* A watcher asks to play with a line of their own (W15): the words are
           theirs, the kind is an application (§6.1). */
        extra={
          <Button kind="secondary" type="button" icon="queue" aria-label={say("table.application")} disabled={!line.trim()} data-testid="apply"
            onClick={() => { const text = line.trim(); if (text) void act(() => tables.say(tableId, { kind: "application", text })).then(() => setLine("")); }} />
        }
      />}
      {view.is_playing && pending && (answered
        ? <p className="ui-hint" data-testid="pending">{say("web.table.waitingAnswers")}</p>
        : <p data-testid="pending">{say("web.table.proposed", { name: nameOf(pending.by ?? 0) })}</p>)}
      {/* One capsule at the foot: accept · decline of a proposal, else the table's next step · standing up;
          a game under way, «leave · say». */}
      <div data-part="foot">
      {proposed
        ? (
          <Split>
            <Button kind="primary" type="button" icon="check" aria-label={say("web.table.accept")} data-testid="accept-game" onClick={() => act(() => tables.answer(tableId, pending!.id, "accept"))} />
            <Button kind="secondary" type="button" icon="close" aria-label={say("web.table.decline")} data-testid="decline-game" onClick={() => act(() => tables.answer(tableId, pending!.id, "decline"))} />
          </Split>
        )
        : (
          <Split>
            {first === "start" && <Button kind="primary" type="button" icon={!board || board.over ? "rematch" : "open"} aria-label={!board || board.over ? say("web.game.rematch") : say("web.table.start")} data-testid="start-game" onClick={() => act(() => tables.propose(tableId, "rematch"))} />}
            {first === "pass" && <Button kind="primary" type="button" icon="pass" aria-label={say("table.pass")} data-testid="pass" onClick={() => void pass()} />}
            {first === "like" && <Button kind="primary" type="button" icon="like" aria-label={say("table.like")} data-testid="like" onClick={() => void like()} />}
            {first === "say" && stand}
            {first === "say"
              ? <Button kind="primary" type="button" icon="say" aria-label={say("table.say")} aria-pressed={saying} data-testid="table-say" onClick={() => setSaying((v) => !v)} />
              : stand}
          </Split>
        )}
      </div>
    </Screen>
  );
}
