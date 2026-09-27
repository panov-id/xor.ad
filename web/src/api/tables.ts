// The table screen's readings (G2). The words are the terminal's
// (depth/ink/locales/ru.json, via api/me.ts), the calls the core's
// (depth/core/tables.ts). Nothing here draws; screens/Table.tsx does.

import type { Answer } from "../../../depth/core/client.ts";
import { say } from "./me.ts";

// A refusal of a move, a seat or a line, as one line for the screen: the
// node's code when it has no words of ours, never a silent failure.
export function tableRefusal(answer: Answer<unknown>): string | null {
  if (answer.status < 400) return null;
  const error = (answer.body as { error?: { code?: string; reason?: string } } | null)?.error;
  const code = error?.code ?? String(answer.status);
  if (code === "not_your_turn") return say("table.notYourTurn");
  if (code === "stale_seq") return say("table.stale");
  return `${say("table.refused")}: ${error?.reason ?? code}`;
}
