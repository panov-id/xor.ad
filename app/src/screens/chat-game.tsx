// The game in a conversation (sosed Dusk: w3_chat-game), the shell only: the proposal and its answer, whose move,
// the end and another round, resign — through ChatGames (depth/core/chat_games.ts, the web's ChatGame.tsx calls the
// same). The board itself is GameBoard's place: its props are what a table's board takes (the chat's view as a
// table's, asTableView), drawn by the games branch's Board.
// The web's testids: chat-game, game-propose, game-waiting, game-offer, game-accept, game-decline, game-turn,
// game-rematch, game-resign; new ones: game-board, game-line, game-hide.
import { useEffect, useMemo, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { asTableView, ChatGames, type ChatGameView } from "@sdk/chat_games.ts";
import type { TableView } from "@sdk/tables.ts";
import { failedLine, label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { flag } from "../shell/icons";
import { CHIP_GAME, type GameStage, proposerKey, stageOf } from "./chat-game-logic";
import { Board } from "./tables/boards";
import { movesIn } from "./tables/table-logic";

const gameName = (set: string): string => label(`web.set.${set}`);

/** The board's place: a table's board (screens/tables/boards.tsx Board) on the chat's game seen as a table — the same
 * panel, the state the node gives, my seat; a move only in my turn, and it goes to ChatGames.move (onMove). */
export function GameBoard({ game, state, onMove }: { game: TableView; state: "mine" | "theirs" | "over"; onMove: (move: unknown) => void }) {
  return (
    <div className="chg-board" data-testid="game-board" data-class={game.class} data-set={game.set} data-state={state} aria-label={gameName(game.set)}>
      <div className="tg-panel" data-class={game.class} data-set={game.set}>
        <Board klass={game.class} set={game.set} state={game.board?.state} seat={game.seat} onMove={movesIn(state, onMove)} />
      </div>
    </div>
  );
}

export interface GameActions {
  onPropose: () => void;
  onAnswer: (accept: boolean) => void;
  onMove: (move: unknown) => void;
  onResign: () => void;
  onRematch: () => void;
  onHide: () => void;
}

export function ChatGamePane({ chatId, view, stage, peer, me, busy, error, actions }:
  { chatId: string; view: ChatGameView | null; stage: GameStage; peer: string; me: string; busy: boolean; error: string | null; actions: GameActions }) {
  const table = useMemo(() => (view ? asTableView(chatId, view, { mine: me, theirs: peer }) : null), [chatId, view, me, peer]);
  return (
    <section className="chg" data-testid="chat-game" data-stage={stage.at}>
      {view && view.board && <p className="chg-line" data-testid="game-line">{say(proposerKey(view), { name: peer })}</p>}
      <div className="chg-panel">
        <header className="chg-head">
          <h2>{view ? say("app.game.title", { game: gameName(view.set) }) : label("app.chat.game")}</h2>
          {stage.at === "playing" && stage.turn && (
            <span className="chg-turn" data-turn={stage.turn} data-testid="game-turn">{say(stage.turn === "mine" ? "app.game.your_move" : "app.game.their_move")}</span>
          )}
          {stage.at === "over" && <span className="chg-turn" data-testid="game-turn">{say("app.game.over")}</span>}
        </header>
        {table && table.board && (
          <GameBoard game={table} state={stage.at === "over" ? "over" : stage.at === "playing" && stage.turn === "mine" ? "mine" : "theirs"} onMove={actions.onMove} />
        )}
        {stage.at === "none" && (
          <div className="chg-ask">
            <button type="button" className="chg-cta" disabled={busy} onClick={actions.onPropose} data-testid="game-propose">{say("app.game.propose", { game: gameName(CHIP_GAME.set) })}</button>
            <button type="button" className="chg-quiet" onClick={actions.onHide} data-testid="game-hide">{say("app.game.hide")}</button>
          </div>
        )}
        {stage.at === "offered" && stage.mine && <p className="chg-note" data-testid="game-waiting">{say("app.game.waiting")}</p>}
        {stage.at === "offered" && !stage.mine && (
          <div className="chg-ask" data-testid="game-offer">
            <p className="chg-note">{stage.kind === "rematch" ? say("app.game.rematch_offered", { name: peer }) : say("app.game.offered", { name: peer, game: gameName(stage.set) })}</p>
            <button type="button" className="chg-cta" disabled={busy} onClick={() => actions.onAnswer(true)} data-testid="game-accept">{say("app.game.accept")}</button>
            <button type="button" className="chg-quiet" disabled={busy} onClick={() => actions.onAnswer(false)} data-testid="game-decline">{say("app.game.decline")}</button>
          </div>
        )}
        {stage.at === "over" && (
          <div className="chg-ask">
            <button type="button" className="chg-cta" disabled={busy} onClick={actions.onRematch} data-testid="game-rematch">{say("app.game.rematch")}</button>
          </div>
        )}
        {error && <p className="chg-error" role="alert" data-testid="error">{error}</p>}
      </div>
      {stage.at === "playing" && (
        <button type="button" className="chg-resign" disabled={busy} onClick={actions.onResign} data-testid="game-resign"><Icon d={flag} /><span>{say("app.game.resign")}</span></button>
      )}
    </section>
  );
}

/** The chat's game held for the screen: read on open and on each board or proposal frame (`bump`, ChatSession). */
export function ChatGame({ client, chatId, bump, peer, onHide }: { client: Client; chatId: string; bump: number; peer: string; onHide: () => void }) {
  const games = useMemo(() => new ChatGames(client), [client]);
  const [view, setView] = useState<ChatGameView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function read() {
    const got = await games.view(chatId).catch(() => null);
    if (!got) return;
    if (got.status === 404) setView(null);
    else if (got.status === 200) setView(got.body);
  }
  useEffect(() => { void read(); }, [bump]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act(run: () => Promise<{ status: number }>) {
    setBusy(true);
    setError(null);
    try {
      const answer = await run();
      if (answer.status >= 400) setError(say("app.game.refused", { status: answer.status }));
      await read();
    } catch (e) {
      setError(failedLine(e));
    } finally {
      setBusy(false);
    }
  }
  const stage = stageOf(view);
  return (
    <ChatGamePane chatId={chatId} view={view} stage={stage} peer={peer} me={say("web.game.you")} busy={busy} error={error} actions={{
      onPropose: () => void act(() => games.propose(chatId, CHIP_GAME.class, CHIP_GAME.set)),
      onAnswer: (accept) => void act(() => (stage.at === "offered" && stage.kind === "rematch"
        ? games.answerRematch(chatId, stage.id, accept ? "accept" : "decline")
        : games.answer(chatId, accept ? "accept" : "decline"))),
      onMove: (move) => void act(() => games.move(chatId, view?.board?.seq ?? 0, move)),
      onResign: () => void act(() => games.resign(chatId)),
      onRematch: () => void act(() => games.rematch(chatId)),
      onHide,
    }} />
  );
}
