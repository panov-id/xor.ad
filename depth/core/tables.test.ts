// Tables through the core against a live node (G2 on G1c) —
// scripts/run-depth-tests.sh starts one. A game of dots on a 2×2 field played
// to the end by two people, every call signed by the core.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";
import { newPaperCode } from "./paper.ts";
import { applyFrame, type Board, dotsOf, frameNeedsView, freeEdges, openTable, SEAT_LOST, Tables, turnOf } from "./tables.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

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
    const moved = await who[board.turn!].tables.move(id, board.seq, { edge: first });
    assertEquals(moved.status, 200, JSON.stringify(moved.body));
    board = moved.body.board;
    const again = await who[board.turn!].tables.move(id, board.seq, { edge: first });
    const refusal = (again.body as unknown as { error?: { code?: string; reason?: string } }).error;
    assertEquals([again.status, refusal?.code, refusal?.reason], [409, "illegal_move", "the edge is taken"], JSON.stringify(again.body));

    // A pass is {seq, pass: true}: the node takes it and the turn moves on.
    const passer = board.turn!;
    const passed = await who[passer].tables.pass(id, board.seq);
    assertEquals(passed.status, 200, JSON.stringify(passed.body));
    board = passed.body.board;
    assert(board.turn !== passer, "the pass did not hand the turn on");

    // Whoever's turn it is, as the core reads it, is the one the node lets move.
    for (;;) {
      const view = (await who[board.turn!].tables.view(id)).body;
      assert(turnOf(view).mine, "the core says it is not my turn while the node waits for me");
      const edges = freeEdges(dotsOf(view.board)!);
      if (edges.length === 0) break;
      const r = await who[board.turn!].tables.move(id, view.board!.seq, { edge: edges[0] });
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

Deno.test({
  name: "a refusal carries the applicant's seat; without it the node refuses; the tables door does not step out of /tables",
  ignore: !node,
  fn: async () => {
    const a = await person("Женя");
    const b = await person("Аня");
    const id = (await a.tables.create({ class: "dots", set: "2x2", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000 })).body.id;
    await b.tables.sit(id);
    assertEquals((await b.tables.say(id, { kind: "application", text: "сыграю" })).status, 202);
    const refused = await a.tables.refuse(id, 2, "в другой раз");
    assertEquals(refused.status, 202, `a refusal naming the applicant's seat was not taken: ${JSON.stringify(refused.body)}`);
    const wrong = await a.tables.refuse(id, 9, "в другой раз");
    assert(wrong.status === 400 || wrong.status === 409, `a refusal of a seat with no application was taken: ${wrong.status}`);
    let thrown = "";
    try {
      await a.client.tableCall("GET", "/tables/../inbox");
    } catch (e) {
      thrown = (e as Error).message;
    }
    assertEquals(thrown, "tableCall is for /tables only", "the tables door let a path out to /inbox");
  },
});

Deno.test({
  name: "the table's socket: a ticket opens the room, a seat and a line come as frames, and standing up closes it 4005",
  ignore: !node,
  fn: async () => {
    const a = await person("Женя");
    const b = await person("Аня");
    const id = (await a.tables.create({ class: "dots", set: "2x2", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000 })).body.id;
    const room = await openTable(a.client, id);
    assertEquals(await room.protocol(), "xor.p1");
    let view = (await a.tables.view(id)).body;
    await b.tables.sit(id);
    // Frames until the seat frame shows two at the table.
    for (let i = 0; i < 10 && view.playing + view.watching < 2; i++) {
      const f = await room.next(5000);
      view = frameNeedsView(f) ? { ...applyFrame(view, f), ...(await a.tables.view(id)).body } : applyFrame(view, f);
    }
    assertEquals(view.playing + view.watching, 2, "the seat frame never said somebody sat down");
    assertEquals((await b.tables.say(id, { kind: "application", text: "сыграю" })).status, 202);
    let line = view.lines.find((l) => l.kind === "application");
    for (let i = 0; i < 10 && !line; i++) {
      view = applyFrame(view, await room.next(5000));
      line = view.lines.find((l) => l.kind === "application");
    }
    assert(line, "the application never came as a line frame");
    assertEquals(line.text, "сыграю");
    await a.tables.stand(id);
    assertEquals(await room.closedWithin(5000), SEAT_LOST, "standing up did not close the room 4005");
  },
});

Deno.test({
  name: "a neighbour's table comes in the feed as a card after the third phrase, and sitting down at it seats you",
  ignore: !node || !databaseUrl,
  fn: async () => {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const me = await person("Аня");
      const neighbour = await person("Костя");
      // A table card goes after every third phrase (G1h): three of a third person's first.
      const talker = await person("Оля");
      for (let i = 0; i < 3; i++) {
        await sql.unsafe(
          `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
             lat_published, lon_published, visible_at, expires_at)
           VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 47.37, 8.54, 1000, 47.37, 8.54, now(), now() + interval '3 hours')`,
          [crypto.randomUUID(), talker.client.identityId, `фраза ${i}`],
        );
      }
      const made = await neighbour.tables.create({ class: "dots", set: "3x3", seats: 2, lat: 47.37, lon: 8.54, area_radius: 1000 });
      assertEquals(made.status, 201, JSON.stringify(made.body));
      const feed = await me.client.feed({ lat: 47.37, lon: 8.54, radius: 1000 });
      const card = (feed.items as Array<{ kind?: string; id: string; game?: string; free_seats?: number }>).find((i) => i.kind === "table");
      assert(card, `no table card in the feed: ${JSON.stringify(feed.items)}`);
      assertEquals([card.id, card.game, card.free_seats], [made.body.id, "dots", 1]);
      const sat = await me.tables.sit(card.id);
      assert(sat.status >= 200 && sat.status < 300, `sitting down was refused: ${sat.status} ${JSON.stringify(sat.body)}`);
      const view = (await me.tables.view(card.id)).body;
      assertEquals(view.seats.map((s) => s.name).sort(), ["Аня", "Костя"], "the one who sat down is not at the table");
    } finally {
      await sql.end();
    }
  },
});
