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
import { Button } from "../ui/Button.tsx";
import "./talk.css";

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
    // A declined proposal leaves the row with neither a board nor a pending
    // offer (relay routes/chat_games.ts): nothing is on, so a game may be offered again.
    else if (got.status === 200) setGame(!got.body.board && !got.body.pending ? "none" : got.body);
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
        {/* «во что сыграть?» as 18D draws it: one row per game, the chosen
            one on panel-2; its sets as chips under the list. */}
        <div role="radiogroup" aria-label={say("web.game.class")} className="talk-picks" data-testid="game-class">
          {CLASSES.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={klass === c.value} data-testid={`game-class-${c.value}`}
              className={klass === c.value ? "talk-pick talk-pick-on" : "talk-pick"}
              onClick={() => { setKlass(c.value as BoardClass); setSet(c.sets[0] ?? ""); }}>
              {c.value}
            </button>
          ))}
        </div>
        {sets.length > 1 && (
          <div role="radiogroup" aria-label={say("web.game.set")} className="talk-sets" data-testid="game-set">
            {sets.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={set === s} data-testid={`game-set-${s}`}
                className={set === s ? "talk-set talk-set-on" : "talk-set"} onClick={() => setSet(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <Button kind="primary" type="button" icon="watch" className="ui-wide" aria-label={say("web.game.propose")} data-testid="game-propose" disabled={busy} onClick={() => act(() => games.propose(chatId, klass, set))} />
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
          <Button kind="primary" type="button" icon="check" aria-label={say("web.game.accept")} data-testid="game-accept" disabled={busy} onClick={() => act(() =>
            pending.kind === "rematch" ? games.answerRematch(chatId, pending.id, "accept") : games.answer(chatId, "accept"))} />{" "}
          <Button kind="secondary" type="button" icon="close" aria-label={say("web.game.decline")} data-testid="game-decline" disabled={busy} onClick={() => act(() =>
            pending.kind === "rematch" ? games.answerRematch(chatId, pending.id, "decline") : games.answer(chatId, "decline"))} />
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
              <Button kind="secondary" type="button" icon="refresh" aria-label={say("web.game.rematch")} data-testid="game-rematch" disabled={busy} onClick={() => act(() => games.rematch(chatId))} />
            )
            : (
              <Button kind="secondary" type="button" icon="giveup" aria-label={say("web.game.resign")} data-testid="game-resign" disabled={busy} onClick={() => act(() => games.resign(chatId))} />
            )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
