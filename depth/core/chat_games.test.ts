// A game in a chat of two, live (GC2): two terminals match, consent, and play
// one game of dots through the core — a proposal, an answer, a move by each —
// while each one's conversation room brings the board and proposal frames.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client, type Room } from "./client.ts";
import { newPaperCode } from "./paper.ts";
import { asTableView, ChatGames, chatTurn, isGameFrame } from "./chat_games.ts";
import { dotsOf, freeEdges } from "./tables.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

async function person(name: string) {
  const c = new Client(node!, apiKey!);
  await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
  await c.confirmPaperCode();
  return c;
}

async function published(sql: postgres.Sql, author: string, text: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.unsafe(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 55.75, 37.62, 1000, 55.75, 37.62,
             now(), now() + interval '3 hours')`,
    [id, author, text],
  );
  return id;
}

// The next game frame a room brings, within a few seconds.
async function gameFrame(room: Room, type: "board" | "proposal") {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const frame = await room.next(end - Date.now()).catch(() => null);
    if (frame && isGameFrame(frame) && frame.type === type) return frame;
  }
  return null;
}

Deno.test({
  name: "two terminals in a chat play one game of dots: proposed, accepted, a move each, frames in both rooms",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    const rooms: Room[] = [];
    try {
      const a = await person("Женя");
      const b = await person("Аня");
      const fromA = await published(sql, a.identityId, "сыграем?");
      const fromB = await published(sql, b.identityId, "давай");
      await a.like(fromB);
      const matchId = (await b.like(fromA)).body.match_id!;
      await a.consent(matchId);
      const chat = ((await b.consent(matchId)).body as { chat_id: string }).chat_id;
      assert(chat, "no chat opened");
      const [roomA, roomB] = [await a.openRoom(chat), await b.openRoom(chat)];
      rooms.push(roomA, roomB);
      const [ga, gb] = [new ChatGames(a), new ChatGames(b)];

      assertEquals((await ga.view(chat)).status, 404, "no game before one is proposed");
      assertEquals((await ga.propose(chat, "dots", "2x2")).status, 204);
      const offer = await gameFrame(roomB, "proposal");
      assertEquals((offer?.data as { kind?: string; mine?: boolean } | null)?.mine, false, "B's room was not offered the game");
      assertEquals((await gb.answer(chat, "accept")).status, 204);

      const mine = (await ga.view(chat)).body;
      assertEquals([mine.your_seat, chatTurn(mine)], [1, "mine"], "the proposer moves first");
      const edges = freeEdges(dotsOf(mine.board)!);
      const first = await ga.move(chat, mine.board!.seq, { edge: edges[0] });
      assertEquals(first.status, 200, JSON.stringify(first.body));
      assertEquals(chatTurn(first.body), "theirs");
      const seenByB = await gameFrame(roomB, "board");
      assert(seenByB, "B's room got no board frame after A's move");

      const theirs = (await gb.view(chat)).body;
      assertEquals(chatTurn(theirs), "mine", "B's turn after A's move");
      const second = await gb.move(chat, theirs.board!.seq, { edge: freeEdges(dotsOf(theirs.board)!)[0] });
      assertEquals(second.status, 200, JSON.stringify(second.body));
      assert(await gameFrame(roomA, "board"), "A's room got no board frame after B's move");
      assertEquals(dotsOf((await ga.view(chat)).body.board)!.edges.length, 2, "two edges taken, one by each");

      // The table's boards draw it unchanged: the chat's view as a table's.
      const tv = asTableView(chat, theirs, { mine: "я", theirs: "Женя" });
      assertEquals([tv.seat, tv.seats.length, tv.is_playing], [2, 2, true]);
    } finally {
      for (const room of rooms) room.close();
      await sql.end();
    }
  },
});
