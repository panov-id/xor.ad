// The game in a conversation, the shell only: the proposal and its answer, whose move, the end and another round,
// resign — through ChatGames (depth/core/chat_games.ts, the web's ChatGame.tsx calls the same). Three looks, as the
// prototype draws them: no game yet is a screen of twelve tiles and «Offer» (chat-game); a proposal is a card with its
// two answers in the conversation's own panel (chat-game-offer); a game on is a screen of the two players, the board
// and «To chat» (chat-game-board). The board itself is GameBoard's place: its props are what a table's board takes
// (the chat's view as a table's, asTableView), drawn by the games branch's Board.
// The web's testids: chat-game, game-propose, game-waiting, game-offer, game-accept, game-decline, game-turn,
// game-rematch, game-resign; new ones: game-board, game-line, game-hide, game-pick-<id>, game-more.
import { type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Client } from "@sdk/client.ts";
import { asTableView, ChatGames, type ChatGameView } from "@sdk/chat_games.ts";
import { GAMES, type Game } from "@sdk/new_table.ts";
import type { TableView } from "@sdk/tables.ts";
import { failedLine, label, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { CHIP_GAME, type GameStage, proposerKey, stageOf } from "./chat-game-logic";
import { OverlayCtx } from "./chat-menu";
import { Board } from "./tables/boards";
import { gameName as tableGameName } from "./tables/table-row";
import { movesIn } from "./tables/table-logic";

const gameName = (set: string): string => label(`web.set.${set}`);

// the prototype's colour and icon of each game's tile (chat-game: the twelve, in the wizard's order)
const TILE: Record<string, { icon: string; c: 1 | 2 | 3 | 4 | 5 | 6 }> = {
  dots: { icon: "g-dots", c: 6 }, checkers: { icon: "g-checkers", c: 1 }, chess: { icon: "g-chess", c: 1 }, durak: { icon: "g-durak", c: 3 },
  hangman: { icon: "g-hangman", c: 6 }, backgammon: { icon: "g-tavli", c: 2 }, dominoes: { icon: "g-domino", c: 1 }, chapayev: { icon: "g-chapayev", c: 4 },
  reversi: { icon: "g-reversi", c: 5 }, four: { icon: "g-four", c: 2 }, battleship: { icon: "g-battleship", c: 1 }, poker: { icon: "g-poker", c: 1 },
};
const CHAT_GAMES: Game[] = GAMES.filter((g) => g.seats.includes(2) && TILE[g.id]);
/** The icon a game of this set is drawn with (a set the tiles lack gets the die). */
const iconOfSet = (set: string): string => TILE[GAMES.find((g) => g.sets.includes(set))?.id ?? ""]?.icon ?? "dice";

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
  onPropose: (game: { class: Game["klass"]; set: string }) => void;
  onAnswer: (accept: boolean) => void;
  onMove: (move: unknown) => void;
  onResign: () => void;
  onRematch: () => void;
  onHide: () => void;
}

/** A screen over the conversation: into the conversation's frame (OverlayCtx), where the frame is. */
function Over({ children }: { children: ReactNode }) {
  const host = useContext(OverlayCtx);
  return host?.el ? createPortal(children, host.el) : <>{children}</>;
}

export function ChatGamePane({ chatId, view, stage, peer, me, busy, error, actions }:
  { chatId: string; view: ChatGameView | null; stage: GameStage; peer: string; me: string; busy: boolean; error: string | null; actions: GameActions }) {
  const host = useContext(OverlayCtx);
  const table = useMemo(() => (view ? asTableView(chatId, view, { mine: me, theirs: peer }) : null), [chatId, view, me, peer]);
  const [pick, setPick] = useState<string>(CHAT_GAMES.find((g) => g.sets.includes(CHIP_GAME.set))?.id ?? CHAT_GAMES[0].id);
  const [more, setMore] = useState(false);
  const errorLine = error && <p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p>;

  // no game yet (chat-game): the twelve tiles, the chosen one lit, «Offer» at the foot
  if (stage.at === "none") {
    const chosen = CHAT_GAMES.find((g) => g.id === pick) ?? CHAT_GAMES[0];
    return (
      <Over>
        <div className="k-col k-ch-full" data-testid="chat-game" data-stage="none">
          <header className="k-row k-bar">
            <button type="button" className="k-bar-btn" aria-label={say("app.game.hide")} onClick={actions.onHide} data-testid="game-hide"><NdIcon name="back" /></button>
            <h1 className="k-bar-title">{label("app.chat.game")}</h1>
          </header>
          <section className="k-panel k-grow k-pad8">
            {errorLine}
            <div className="k-gp-grid" role="radiogroup" aria-label={label("app.chat.game")}>
              {CHAT_GAMES.map((g) => (
                <button key={g.id} type="button" role="radio" aria-checked={g.id === chosen.id} className="k-gp-tile" aria-label={label(tableGameName(g))}
                  onClick={() => setPick(g.id)} data-testid={`game-pick-${g.id}`}>
                  <span className="k-badge" data-c={TILE[g.id].c} aria-hidden="true"><NdIcon name={TILE[g.id].icon} /></span>
                </button>
              ))}
            </div>
          </section>
          <section className="k-panel k-actions">
            <div className="k-row">
              <button type="button" className="k-cta" disabled={busy} onClick={() => actions.onPropose({ class: chosen.klass, set: chosen.sets[0] })} data-testid="game-propose">
                <NdIcon name="send" /><span>{say("app.game.propose", { game: label(tableGameName(chosen)) })}</span>
              </button>
            </div>
          </section>
        </div>
      </Over>
    );
  }

  // a proposal (chat-game-offer): the card, and under it the two answers; mine waits
  if (stage.at === "offered") {
    return (
      <section className="k-gp-offer-box" data-testid="chat-game" data-stage="offered">
        {view && view.board && <p className="k-sr" data-testid="game-line">{say(proposerKey(view), { name: peer })}</p>}
        <div className="k-tile k-gp-offer" data-testid={stage.mine ? undefined : "game-offer"}>
          <NdIcon name={iconOfSet(stage.set)} />
          {stage.mine
            ? <p data-testid="game-waiting">{say("app.game.waiting")}</p>
            : <p>{stage.kind === "rematch" ? say("app.game.rematch_offered", { name: peer }) : say("app.game.offered", { name: peer, game: gameName(stage.set) })}</p>}
        </div>
        {!stage.mine && (
          <div className="k-row">
            <button type="button" className="k-cta" data-outline="" data-fit="" disabled={busy} aria-label={say("app.game.decline")} onClick={() => actions.onAnswer(false)} data-testid="game-decline"><NdIcon name="close" /></button>
            <button type="button" className="k-cta" data-fit="" disabled={busy} aria-label={say("app.game.accept")} onClick={() => actions.onAnswer(true)} data-testid="game-accept"><NdIcon name="check" /></button>
          </div>
        )}
        {errorLine}
      </section>
    );
  }

  // a game on, or over (chat-game-board): the two players, the board, the foot
  const mineUp = stage.at === "playing" && stage.turn === "mine";
  const theirsUp = stage.at === "playing" && stage.turn === "theirs";
  const turnWord = stage.at === "over" ? say("app.game.over") : stage.turn ? say(stage.turn === "mine" ? "app.game.your_move" : "app.game.their_move") : null;
  return (
    <Over>
      <div className="k-col k-ch-full" data-testid="chat-game" data-stage={stage.at}>
        {host ? host.bar(actions.onHide, say("app.game.to_chat"), false) : (
          <header className="k-row k-bar">
            <button type="button" className="k-bar-btn" aria-label={say("app.game.to_chat")} onClick={actions.onHide}><NdIcon name="back" /></button>
            <h1 className="k-bar-title">{view ? say("app.game.title", { game: gameName(view.set) }) : label("app.chat.game")}</h1>
          </header>
        )}
        {view && view.board && <p className="k-sr" data-testid="game-line">{say(proposerKey(view), { name: peer })}</p>}
        <section className="k-panel k-pad8 k-gp-players">
          <div className="k-row">
            <div className="k-gp-chip" data-mine="" data-up={mineUp ? "" : undefined}>
              <span className="k-gp-ava" aria-hidden="true"><NdIcon name="me" /></span>
              <span className="k-stack"><b>{me}</b>{(mineUp || stage.at === "over") && turnWord && <span data-testid="game-turn" data-turn={mineUp ? "mine" : undefined}>{turnWord}</span>}</span>
            </div>
            <div className="k-gp-chip" data-up={theirsUp ? "" : undefined}>
              <span className="k-gp-ava" aria-hidden="true"><NdIcon name="me" /></span>
              <span className="k-stack"><b>{peer}</b>{theirsUp && turnWord && <span data-testid="game-turn" data-turn="theirs">{turnWord}</span>}</span>
            </div>
          </div>
        </section>
        <section className="k-panel k-pad8 k-grow k-gp-board">
          {errorLine}
          {table && table.board && (
            <GameBoard game={table} state={stage.at === "over" ? "over" : stage.at === "playing" && stage.turn === "mine" ? "mine" : "theirs"} onMove={actions.onMove} />
          )}
        </section>
        <section className="k-panel k-actions">
          <div className="k-row">
            {stage.at === "playing" ? (
              <button type="button" className="k-gp-more" aria-label={say("app.chat.more")} aria-haspopup="dialog" onClick={() => setMore(true)} data-testid="game-more"><NdIcon name="more" /></button>
            ) : (
              <button type="button" className="k-cta" data-fit="" disabled={busy} onClick={actions.onRematch} data-testid="game-rematch"><NdIcon name="rematch" /><span>{say("app.game.rematch")}</span></button>
            )}
            <button type="button" className="k-cta" data-outline="" data-fit="" onClick={actions.onHide} data-testid="game-hide"><NdIcon name="talks" /><span>{say("app.game.to_chat")}</span></button>
          </div>
        </section>
        {more && (
          <div className="k-chm k-chm-in">
            <button type="button" className="k-chm-dim" aria-label={say("common.back")} onClick={() => setMore(false)} />
            <section className="layer-sheet k-chm-sheet" role="dialog" aria-modal="true" aria-labelledby="gm-title">
              <h2 className="k-sheet-title" id="gm-title">{label("app.chat.game")}</h2>
              <ul className="k-picks">
                <li>
                  <button type="button" className="k-pick" data-danger="" disabled={busy} onClick={() => { setMore(false); actions.onResign(); }} data-testid="game-resign">
                    <span className="k-badge" data-c="3" aria-hidden="true"><NdIcon name="giveup" /></span><span>{say("app.game.resign")}</span>
                  </button>
                </li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </Over>
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
  async function act(run: () => Promise<{ status: number }>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const answer = await run();
      if (answer.status >= 400) setError(say("app.game.refused", { status: answer.status }));
      await read();
      return answer.status < 400;
    } catch (e) {
      setError(failedLine(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const stage = stageOf(view);
  return (
    <ChatGamePane chatId={chatId} view={view} stage={stage} peer={peer} me={say("web.game.you")} busy={busy} error={error} actions={{
      onPropose: (game) => void act(() => games.propose(chatId, game.class, game.set)),
      onAnswer: (accept) => void act(() => (stage.at === "offered" && stage.kind === "rematch"
        ? games.answerRematch(chatId, stage.id, accept ? "accept" : "decline")
        : games.answer(chatId, accept ? "accept" : "decline"))).then((ok) => { if (!accept && ok && stage.at === "offered" && stage.kind === "game") onHide(); }),
      onMove: (move) => void act(() => games.move(chatId, view?.board?.seq ?? 0, move)),
      onResign: () => void act(() => games.resign(chatId)),
      onRematch: () => void act(() => games.rematch(chatId)),
      onHide,
    }} />
  );
}
