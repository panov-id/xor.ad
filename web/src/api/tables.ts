// The table screen's readings (G2). The words are the terminal's
// (depth/ink/locales/ru.json, via api/me.ts), the calls the core's
// (depth/core/tables.ts). Nothing here draws; screens/Table.tsx does.

import type { Answer } from "../../../depth/core/client.ts";
import { makeTableWords } from "../../../depth/core/new_table.ts";
import { refusalText } from "./actions.ts";
import { say } from "./me.ts";

// A refusal of a move, a seat or a line, as one line for the screen: our words
// for the codes that have them, the status in words for the rest, never a
// silent failure. The node's free text (error.reason) is not shown (К6).
export function tableRefusal(answer: Answer<unknown>): string | null {
  if (answer.status < 400) return null;
  const error = (answer.body as { error?: { code?: string; reason?: string } } | null)?.error;
  const code = error?.code ?? String(answer.status);
  if (code === "not_your_turn") return say("table.notYourTurn");
  if (code === "stale_seq") return say("table.stale");
  return refusalText("name", error?.code, answer.status);
}

// The class of a table by its dictionary name («точки»), never its id («dots»), and the set by its name
// («колода из 36 карт»; an id with no word shows as itself): depth/core/new_table.ts makeTableWords, shared with the
// app. The ids of the sets are the node's (relay/node/src/lib/tables_*.ts, listed in screens/NewTable.tsx CLASSES).
const words = makeTableWords(say);
export const classWord = words.classWord;
export const setWord = words.setWord;

// A card as the node deals it (lib/tables_deck.ts:12-13, lib/tables_poker.ts:20):
// a rank "2".."10", "J" "Q" "K" "A" and a suit "S" "H" "D" "C", so "QS" or
// "10H" — except that poker writes the ten as "T" ("TS"). Durak plays 6..A,
// poker 2..A. Spoken in words («дама пик»); a string that is not a card shows
// as it came.
export function cardWord(card: string): string {
  const m = /^(10|[2-9TJQKA])([SHDC])$/.exec(card);
  if (!m) return card;
  return say("web.table.cardName", { rank: say(`web.rank.${m[1] === "T" ? "10" : m[1]}`), suit: say(`web.suit.${m[2]}`) });
}

// A die face 1..6 (lib/tables_dice.ts) as a number word («пять»).
export function dieWord(face: number): string {
  const key = `web.die.${face}`;
  const word = say(key);
  return word === key ? String(face) : word;
}
