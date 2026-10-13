// The model is asked only for a live session. A table line, a table move and
// a move in a chat of two used to get the moderator's verdict before the
// signature was checked, so anyone who could reach the node could keep the
// model busy with unsigned requests (handoff 13.10.2026, item 4). Each route
// here gets an unsigned request whose body would reach the model, and must
// answer 401 without a single call to it.

import { assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({ MODERATOR_URL: "http://moderator.test" });

const ID = "00000000-0000-4000-8000-000000000001";
const ROUTES: [string, unknown][] = [
  [`/tables/${ID}/lines`, { kind: "line", text: "привет, соседи" }],
  [`/tables/${ID}/moves`, { seq: 1, move: { word: "соседи" } }],
  [`/chats/${ID}/game/moves`, { seq: 1, move: { word: "соседи" } }],
  [`/chats/${ID}/game/word`, { word: "соседи" }],
];

for (const [path, body] of ROUTES) {
  configured(`an unsigned POST ${path.replace(ID, ":id")} is 401 and never reaches the model`, async () => {
    const { dispatch } = await import("../src/dispatch.ts");
    const real = globalThis.fetch;
    const asked: string[] = [];
    globalThis.fetch = (input: string | URL | Request) => {
      asked.push(String(input instanceof Request ? input.url : input));
      return Promise.resolve(new Response(JSON.stringify({ message: { content: '{"verdict":"publish"}' } })));
    };
    try {
      const answer = await dispatch(
        new Request(`https://node.test${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-protocol-version": "1" },
          body: JSON.stringify(body),
        }),
      );
      await answer.body?.cancel();
      assertEquals(asked, [], `the model was asked before the signature was checked: ${asked.join(", ")}`);
      assertEquals(answer.status, 401, "an unsigned request is not a live session's");
    } finally {
      globalThis.fetch = real;
    }
  });
}
