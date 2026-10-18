// chat-game-logic.ts: the stage of a conversation's game from the node's view.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatGameView } from "../../../depth/core/chat_games.ts";
import { CHIP_GAME, proposerKey, stageOf } from "./chat-game-logic.ts";

const board = (over: Partial<NonNullable<ChatGameView["board"]>> = {}) => ({ seq: 3, state: {}, turn: 2, score: {}, expires_at: null, ...over });
const view = (over: Partial<ChatGameView> = {}): ChatGameView => ({ class: "grid", set: "four", your_seat: 2, board: null, pending: null, ...over });

test("stageOf: no game, and a declined proposal, are none", () => {
  assert.deepEqual(stageOf(null), { at: "none" });
  assert.deepEqual(stageOf(view()), { at: "none" });
});

test("stageOf: a proposal before any board is offered, mine or theirs", () => {
  assert.deepEqual(stageOf(view({ pending: { id: "p1", kind: "game", class: "grid", set: "four", mine: false } })),
    { at: "offered", mine: false, kind: "game", id: "p1", set: "four" });
  assert.deepEqual(stageOf(view({ your_seat: 1, pending: { id: "p2", kind: "game", mine: true } })),
    { at: "offered", mine: true, kind: "game", id: "p2", set: "four" });
});

test("stageOf: a board in play says whose move it is from this side", () => {
  assert.deepEqual(stageOf(view({ board: board({ turn: 2 }) })), { at: "playing", turn: "mine" });
  assert.deepEqual(stageOf(view({ board: board({ turn: 1 }) })), { at: "playing", turn: "theirs" });
  assert.deepEqual(stageOf(view({ board: board({ turn: null }) })), { at: "playing", turn: null });
});

test("stageOf: an over board is over; another round asked over it is offered", () => {
  assert.deepEqual(stageOf(view({ board: board({ over: true }) })), { at: "over" });
  assert.deepEqual(stageOf(view({ board: board({ over: true }), pending: { id: "r1", kind: "rematch", mine: false } })),
    { at: "offered", mine: false, kind: "rematch", id: "r1", set: "four" });
});

test("proposerKey: seat 1 proposed", () => {
  assert.equal(proposerKey(view({ your_seat: 1 })), "app.game.you_proposed");
  assert.equal(proposerKey(view({ your_seat: 2 })), "app.game.they_proposed");
});

test("CHIP_GAME: the chip's backgammon", () => {
  assert.deepEqual({ ...CHIP_GAME }, { class: "dice", set: "backgammon" });
});
