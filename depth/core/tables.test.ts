// Tables through the core against a live node (G2 on G1c) —
// scripts/run-depth-tests.sh starts one. A game of dots on a 2×2 field played
// to the end by two people, every call signed by the core.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { Client } from "./client.ts";
import { newPaperCode } from "./paper.ts";
import { type Board, dotsOf, freeEdges, Tables, turnOf } from "./tables.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");

async function person(name: string) {
  const c = new Client(node!, apiKey!);
  await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
  await c.confirmPaperCode();
  return { client: c, tables: new Tables(c) };
}

Deno.test({
  name: "dots through the core: set, sit, apply, rematch, a taken edge refused, played to the end with the boxes scored",
  ignore: !node,
  fn: async () => {
    const a = await person("Женя");
    const b = await person("Аня");
    const made = await a.tables.create({ class: "dots", set: "2x2", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000 });
    assertEquals(made.status, 201, JSON.stringify(made.body));
    const id = made.body.id;
    const sat = await b.tables.sit(id);
    assert(sat.status >= 200 && sat.status < 300, `the seat was refused: ${sat.status} ${JSON.stringify(sat.body)}`);
    assertEquals((await b.tables.say(id, { kind: "application", text: "сыграю" })).status, 202);
    const proposed = await a.tables.propose(id, "rematch");
    assert(proposed.status >= 200 && proposed.status < 300, `the rematch was refused: ${proposed.status} ${JSON.stringify(proposed.body)}`);

    const seen = await a.tables.view(id);
    assertEquals(seen.status, 200, JSON.stringify(seen.body));
    const dots = dotsOf(seen.body.board);
    assert(dots, `the board has no dots: ${JSON.stringify(seen.body.board)}`);
    assertEquals(dots.n, 2);
    assertEquals(seen.body.seats.map((s) => s.name).sort(), ["Аня", "Женя"]);

    const who = { 1: a, 2: b } as Record<number, typeof a>;
    let board = seen.body.board as Board;
    const first = freeEdges(dots)[0];
    const moved = await who[board.turn].tables.move(id, board.seq, { edge: first });
    assertEquals(moved.status, 200, JSON.stringify(moved.body));
    board = moved.body.board;
    const again = await who[board.turn].tables.move(id, board.seq, { edge: first });
    assertEquals(again.status, 409, "a taken edge was accepted");

    // Whoever's turn it is, as the core reads it, is the one the node lets move.
    for (;;) {
      const view = (await who[board.turn].tables.view(id)).body;
      assert(turnOf(view).mine, "the core says it is not my turn while the node waits for me");
      const edges = freeEdges(dotsOf(view.board)!);
      if (edges.length === 0) break;
      const r = await who[board.turn].tables.move(id, view.board!.seq, { edge: edges[0] });
      assertEquals(r.status, 200, JSON.stringify(r.body));
      board = r.body.board;
      if (board.over) break;
    }
    const end = (await a.tables.view(id)).body.board!;
    assertEquals(end.over, true);
    assertEquals(Object.values(end.score).reduce((x, y) => x + y, 0), 4, "four boxes on a 2×2 field");
    assertEquals(turnOf((await a.tables.view(id)).body).secondsLeft, null, "a finished game still shows a clock");
  },
});
