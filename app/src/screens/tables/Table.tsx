// A table (sheets w3_table-*, sosed Dusk, mobile): the bar — back, «game · name», «…» — the two faces with the line
// under mine and the ring of the move's minutes, the board on its panel, and the stickers as chips at the foot. The
// web's Table.tsx moves: the view once (Tables.view), then the room's frames laid on it (depth/web-platform
// table_room.ts, depth/core applyFrame); moves, passes, proposals and lines through depth/core Tables. The node keeps
// every rule (relay/node/src/lib/tables_*.ts); what the frame shows is table-logic.ts, each board draws its own part.
// Back leaves the table with the seat kept (web TB1, owner 11.10.2026: «"Назад" без вставания»); «Leave» in «…» stands up.
// Testids (the web's): table, table-more, table-menu, pass, resign, like, table-stand, start-game, accept-game,
// decline-game, turn, over, stickers, sticker-<id>; plus table-back, face-left, face-right, move-ring.
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Client } from "@sdk/client.ts";
import { gameOfTable } from "@sdk/new_table.ts";
import { applyFrame, frameNeedsView, type TableView, Tables } from "@sdk/tables.ts";
import { connectTable } from "@platform/table_room.ts";
import { capital } from "../../i18n-core";
import { failedLine, label, LANG, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { chevronLeft, chevronRight, ellipsis } from "../../shell/icons";
import { useLayers } from "../../shell/layers";
import { Screen } from "../../shell/Screen";
import { initial } from "../me/me-logic";
import { Board, BoardUnder } from "./boards";
import { gameName } from "./table-row";
import { facePair, firstAction, meLine, moveRing, STICKER_CHIPS, tableTitle } from "./table-logic";
import { toneAt } from "./tables-logic";

type Answer = { status: number; body: unknown };
// A chip says the app's own word where the sheet has one (app.table.sticker.hi «Hi!»), else the catalogue's, capitalised.
const chipWord = (id: string): string => {
  const own = `app.table.sticker.${id}`;
  const word = say(own);
  return word === own ? capital(say(`web.sticker.${id}`), LANG) : word;
};
const refusalOf = (a: Answer): string | null => (a.status < 400 ? null : say("app.failed"));

export function Table({ client, tableId, onBack, onLeave }: { client: Client; tableId: string; onBack: () => void; onLeave: () => void }) {
  const [tables] = useState(() => new Tables(client));
  const [view, setView] = useState<TableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  const [said, setSaid] = useState("");
  const { open, close } = useLayers();

  const load = useCallback(async () => {
    try {
      const answer = await tables.view(tableId);
      if (answer.status === 200) setView(answer.body); else setError(refusalOf(answer));
    } catch (e) { setError(failedLine(e)); }
  }, [tables, tableId]);

  // The room: the view once, each frame laid on it; a frame that changes who plays reads the table whole again.
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

  const act = async (run: () => Promise<Answer>) => {
    setError(null);
    try { const refused = refusalOf(await run()); if (refused) setError(refused); } catch (e) { setError(failedLine(e)); }
    await load();
  };

  const game = view ? gameOfTable(view.class, view.set) : undefined;
  const title = view ? tableTitle(game ? label(gameName(game)) : label("table.title"), view.name) : label("table.title");
  const bar = (more?: ReactNode) => (
    <header className="me-bar tg-bar">
      <button type="button" className="me-back" aria-label={label("common.back")} onClick={onBack} data-testid="table-back"><Icon d={chevronLeft} /></button>
      <h1>{title}</h1>
      {more}
    </header>
  );
  if (!view) {
    return (
      <Screen name="table" title={title} className="me-sub tg-table">
        {bar()}
        <div className="tg-sheet">{error ? <p className="me-error" role="alert" data-testid="error">{error}</p> : <p className="tg-quiet">…</p>}</div>
      </Screen>
    );
  }

  const board = view.board;
  const { left, right } = facePair(view);
  const mine = meLine(view);
  const ring = moveRing(view);
  const first = firstAction(view);
  const started = !!board && !board.over && board.turn !== null;
  const pending = board?.pending as { id: string; by?: number; answers?: Record<string, string> } | null | undefined;
  const answered = !!pending && (pending.by === view.seat || pending.answers?.[String(view.seat)] === "accept");
  const proposed = view.is_playing && !!pending && !answered;
  const onMove = view.is_playing && started && board!.turn === view.seat ? (m: unknown) => void act(() => tables.move(tableId, board!.seq, m)) : undefined;
  const line = mine.state === "your-move" ? say("app.table.your_move")
    : mine.state === "their-move" ? say("app.table.their_move", { name: mine.name ?? "" })
    : mine.state === "over" ? say("table.over") : mine.state === "not-started" ? say("table.notStarted") : say("app.table.watching");

  const menu = () => open("table-more", (
    <div className="fd-sheet" data-testid="table-menu">
      <span className="fd-grab" aria-hidden="true" />
      <h2>{title}</h2>
      <p className="tg-open" role="note">{say("table.open")}</p>
      <ul className="fd-menu">
        {first !== "start" && onMove && <li><button type="button" onClick={() => { close(); void act(() => tables.pass(tableId, board!.seq)); }} data-testid="pass"><span>{say("table.pass")}</span><Icon d={chevronRight} /></button></li>}
        {view.is_playing && started && <li><button type="button" onClick={() => { close(); void act(() => tables.resign(tableId)); }} data-testid="resign"><span>{say("table.resign")}</span><Icon d={chevronRight} /></button></li>}
        <li><button type="button" onClick={() => { close(); void act(() => tables.like(tableId)); }} data-testid="like"><span>{say("table.like")}</span><Icon d={chevronRight} /></button></li>
        <li><button type="button" className="fd-danger" onClick={() => { close(); void act(async () => { const a = await tables.stand(tableId); if (a.status < 400) onLeave(); return a; }); }} data-testid="table-stand"><span>{say("table.stand")}</span><Icon d={chevronRight} /></button></li>
      </ul>
    </div>
  ));

  return (
    <Screen name="table" title={title} className="me-sub tg-table" data-testid="table" data-id={tableId}>
      {bar(<button type="button" className="me-back tg-more" aria-label={say("web.chat.more")} aria-haspopup="dialog" onClick={menu} data-testid="table-more"><Icon d={ellipsis} /></button>)}
      <div className="tg-faces">
        {left && <span className="tg-face" data-face="me" data-testid="face-left" aria-hidden="true">{initial(view.is_playing ? (left.name || "?") : left.name)}</span>}
        <p className="tg-me" data-testid={board?.over ? "over" : "turn"}>
          {mine.who === "you" ? label("table.you") : mine.name}<span aria-hidden="true"> · </span>{line}
        </p>
        {ring && (
          <span className="tg-ring" style={{ "--share": ring.share } as CSSProperties} role="img" aria-label={say("app.table.minutes", { n: ring.minutes })} data-testid="move-ring">
            <span aria-hidden="true">{ring.minutes}</span>
          </span>
        )}
        {right && <span className="tg-face" data-face="them" data-testid="face-right" aria-label={right.name}>{initial(right.name)}</span>}
      </div>
      <div className="tg-sheet">
        <div className="tg-panel" data-class={view.class} data-set={view.set}>
          <Board klass={view.class} set={view.set} state={board?.state} seat={view.seat} seats={view.seats.filter((s) => s.role === "playing").map((s) => s.seat).sort((a, b) => a - b)} onMove={onMove} />
        </div>
        <BoardUnder klass={view.class} set={view.set} state={board?.state} seat={view.seat} onMove={onMove} />
        {error && <p className="me-error" role="alert" data-testid="error">{error}</p>}
        {proposed && (
          <div className="tg-ask">
            <button type="button" className="cta cta-primary" onClick={() => void act(() => tables.answer(tableId, pending!.id, "accept"))} data-testid="accept-game">{say("web.table.accept")}</button>
            <button type="button" className="cta cta-quiet" onClick={() => void act(() => tables.answer(tableId, pending!.id, "decline"))} data-testid="decline-game">{say("web.table.decline")}</button>
          </div>
        )}
        {!proposed && first === "start" && (
          <button type="button" className="cta cta-primary tg-start" onClick={() => void act(() => tables.propose(tableId, "rematch"))} data-testid="start-game">
            {say(!board || board.over ? "web.game.rematch" : "web.table.start")}
          </button>
        )}
        {/* Words at the table for the players (owner 14.10.2026: «вернуть текст игрокам»), above the stickers. */}
        {view.is_playing && (
          <form className="tg-line" onSubmit={(e) => { e.preventDefault(); const text = said.trim(); if (text) void act(() => tables.say(tableId, { kind: "line", text })).then(() => setSaid("")); }}>
            <input value={said} maxLength={128} onChange={(e) => setSaid(e.target.value)} placeholder={say("app.table.message")} aria-label={say("web.table.line")} data-testid="line-input" />
          </form>
        )}
        <div className="tg-chips" role="group" aria-label={say("web.sticker.title")} data-testid="stickers">
          {STICKER_CHIPS.map((id, i) => (
            <button key={id} type="button" className="tg-chip" data-tone={toneAt(i)} onClick={() => void act(() => tables.say(tableId, { kind: "sticker", sticker: id }))} data-testid={`sticker-${id}`}>
              {chipWord(id)}
            </button>
          ))}
        </div>
      </div>
    </Screen>
  );
}
