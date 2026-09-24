// The close codes of protocol §4.4, and the pause before coming back.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { afterClose, reconnectDelay } from "./reconnect.ts";

Deno.test("each close code gets the protocol's answer", () => {
  assertEquals(afterClose(4003), "over");
  for (const code of [1001, 1011, 1006, 4001]) assertEquals(afterClose(code), "reconnect", `code ${code}`);
  for (const code of [1000, 4002, 4004, 4005]) assertEquals(afterClose(code), "stay", `code ${code}`);
});

Deno.test("the pause doubles to a ceiling, and never lands everyone at once", () => {
  assertEquals(reconnectDelay(0, () => 0), 500);
  assertEquals(reconnectDelay(0, () => 1), 1000);
  assertEquals(reconnectDelay(3, () => 1), 8000);
  assertEquals(reconnectDelay(40, () => 1), 30_000, "the pause has no ceiling");
  assertEquals(reconnectDelay(40, () => 0), 15_000);
  const spread = new Set(Array.from({ length: 20 }, () => reconnectDelay(2)));
  assert(spread.size > 1, "every room would come back in the same instant");
});
