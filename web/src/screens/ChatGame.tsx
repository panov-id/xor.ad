// A game in a conversation (GC3): propose one, answer, play, ask for another
// round, resign. The boards are the table's (TableBoards.tsx) — one drawing
// for both places; the node keeps the rules and cuts the board by seat.
// `bump` moves when a `board` or `proposal` frame arrives on the chat's
// socket, and the game is read again then.

import { useCallback, useEffect, useState } from "react";
import type { Answer, Client } from "../../../depth/core/client.ts";
import { dotsOf, type BoardClass, turnOf } from "../../../depth/core/tables.ts";
import { asTableView, ChatGames, type ChatGameView } from "../api/chatGames.ts";
import { tableRefusal } from "../api/tables.ts";
import { say } from "../locales/say.ts";
import { CLASSES } from "./NewTable.tsx";
import { CellsBoard, DeckBoard, DotsBoard, FreeBoard, WordBoard } from "./TableBoards.tsx";

export function ChatGame({ client, chatId, bump }: { client: Client; chatId: string; bump: number }) {
  const games = new ChatGames(client);
  const [game, setGame] = useState<ChatGameView | null | "none">(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [klass, setKlass] = useState<BoardClass>("dots");
  const [set, setSet] = useState<string>(CLASSES[0].sets[0]);

  const read = useCallback(async () => {
    const got = await games.look(chatId);
    if (got.status === 404) setGame("none");
    else if (got.status === 200) setGame(got.body);
    else setError(tableRefusal(got));
  }, [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void read(); }, [read, bump]);

  const act = async (call: () => Promise<Answer<unknown>>) => {
    setBusy(true);
    setError(null);
    try {
      const answer = await call();
      const refused = tableRefusal(answer);
      if (refused) setError(refused);
      await read();
    } finally {
      setBusy(false);
    }
  };

  if (game === null) return null;

  if (game === "none") {
    const sets = CLASSES.find((c) => c.value === klass)?.sets ?? [];
    return (
      <section data-testid="chat-game" aria-label={say("web.game.title")}>
        <label>
          {say("web.game.class")}{" "}
          <select value={klass} data-testid="game-class" onChange={(e) => {
            const next = e.target.value as BoardClass;
            setKlass(next);
            setSet(CLASSES.find((c) => c.value === next)?.sets[0] ?? "");
          }}>
            {CLASSES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
          </select>
        </label>{" "}
        <label>
          {say("web.game.set")}{" "}
          <select value={set} data-testid="game-set" onChange={(e) => setSet(e.target.value)}>
            {sets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>{" "}
        <button type="button" data-testid="game-propose" disabled={busy} onClick={() => act(() => games.propose(chatId, klass, set))}>
          {say("web.game.propose")}
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  }

  const view = asTableView(chatId, game, { mine: say("web.game.you"), theirs: say("web.game.peer") });
  const board = game.board;
  const turn = turnOf(view);
  const onMove = board && turn.mine && !busy ? (move: unknown) => void act(() => games.move(chatId, board.seq, move)) : undefined;
  const pending = game.pending;

  return (
    <section data-testid="chat-game" aria-label={say("web.game.title")}>
      {pending && pending.mine && <p data-testid="game-waiting">{say("web.game.waiting")}</p>}
      {pending && !pending.mine && (
        <p data-testid="game-offer">
          {pending.kind === "rematch" ? say("web.game.rematch_offered") : say("web.game.offered", { game: `${pending.class} ${pending.set}` })}{" "}
          <button type="button" data-testid="game-accept" disabled={busy} onClick={() => act(() =>
            pending.kind === "rematch" ? games.answerRematch(chatId, pending.id, "accept") : games.answer(chatId, "accept"))}>
            {say("web.game.accept")}
          </button>{" "}
          <button type="button" data-testid="game-decline" disabled={busy} onClick={() => act(() =>
            pending.kind === "rematch" ? games.answerRematch(chatId, pending.id, "decline") : games.answer(chatId, "decline"))}>
            {say("web.game.decline")}
          </button>
        </p>
      )}
      {board && (
        <>
          <p data-testid="game-turn">
            {board.over ? say("web.game.over") : turn.mine ? say("web.game.your_turn") : say("web.game.their_turn")}
          </p>
          {dotsOf(board) && <DotsBoard view={view} onEdge={onMove ? (edge) => onMove({ edge }) : undefined} />}
          {!dotsOf(board) && (
            <>
              <DeckBoard view={view} onMove={onMove} />
              <WordBoard view={view} onMove={onMove} />
              <FreeBoard view={view} onMove={onMove} />
              <CellsBoard view={view} onMove={onMove} />
            </>
          )}
          {board.over
            ? !pending && (
              <button type="button" data-testid="game-rematch" disabled={busy} onClick={() => act(() => games.rematch(chatId))}>
                {say("web.game.rematch")}
              </button>
            )
            : (
              <button type="button" data-testid="game-resign" disabled={busy} onClick={() => act(() => games.resign(chatId))}>
                {say("web.game.resign")}
              </button>
            )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
