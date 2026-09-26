// Lines written before the second's consent (§8.5, chat_RU.md:2131): the queue
// itself, then the queue against a live node — scripts/run-depth-tests.sh.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";
import { newPaperCode } from "./paper.ts";
import { PENDING_MAX, PendingQueue } from "./pending.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

Deno.test("past chat.pending.max the oldest line leaves, silently, and the order holds", () => {
  const q = new PendingQueue();
  for (let i = 0; i < PENDING_MAX + 5; i++) q.push("m", `строка ${i}`);
  assertEquals(PENDING_MAX, 200, "the ceiling is not the registry's chat.pending.max");
  assertEquals(q.size("m"), PENDING_MAX, "the queue grew past its ceiling");
  assertEquals(q.peek("m")[0], "строка 5", "not the oldest lines left");
  assertEquals(q.peek("m")[PENDING_MAX - 1], `строка ${PENDING_MAX + 4}`, "the newest line was lost");
});

Deno.test("what went out leaves from the front, and each match keeps its own queue", () => {
  const q = new PendingQueue();
  for (const t of ["раз", "два", "три"]) q.push("m", t);
  q.push("other", "чужая");
  q.sent("m", 2);
  assertEquals(q.peek("m"), ["три"]);
  assertEquals(q.peek("other"), ["чужая"], "one match's queue touched another's");
  q.drop("other");
  assertEquals(q.size("other"), 0, "a dropped queue kept its lines");
});

// Two terminals with phrases, a match between them, and only the first
// consented: the conversation waits for the second.
async function waitingMatch(sql: postgres.Sql) {
  const person = async (name: string) => {
    const c = new Client(node!, apiKey!);
    await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
    await c.confirmPaperCode();
    return c;
  };
  const a = await person("Женя");
  const b = await person("Аня");
  const put = async (who: string, text: string) => {
    const id = crypto.randomUUID();
    await sql.unsafe(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33, now(), now() + interval '3 hours')`,
      [id, who, text]);
    return id;
  };
  const pa = await put(a.identityId, "кто на набережную?");
  const pb = await put(b.identityId, "гуляю у реки");
  await a.like(pb);
  const matchId = (await b.like(pa)).body.match_id!;
  const first = await a.consent(matchId);
  assertEquals(first.body.state, "waiting", "the first consent did not wait for the second");
  return { a, b, matchId };
}

// Every frame b's room hands over, opened, in the order it came.
async function readAll(b: Client, chatId: string, matchId: string, n: number): Promise<string[]> {
  const room = await b.openRoom(chatId);
  const got: string[] = [];
  try {
    while (got.length < n) {
      const frame = await room.next();
      if (frame.type !== "message") continue;
      const data = frame.data as { id: string; ciphertext: string };
      got.push(await b.read(chatId, data.ciphertext, data.id, matchId));
    }
  } finally {
    room.close();
  }
  return got;
}

Deno.test({
  name: "lines written before the second's consent reach them after it, in the order they were written",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, matchId } = await waitingMatch(sql);
      for (const t of ["привет", "я у моста", "в синей куртке"]) a.queueLine(matchId, t);
      // Nothing of it reached the node: the node takes neither lines nor the fact of them.
      const [held] = await sql`SELECT count(*)::int AS n FROM pending_deliveries`;
      const before = held.n;
      const chatId = (await b.consent(matchId)).body.chat_id!;
      assert(chatId, "the second consent did not open the chat");
      assertEquals(await a.flushQueued(chatId, matchId), null, "the queue did not all go");
      assertEquals(a.queued(matchId).length, 0, "lines that went stayed queued");
      const [after] = await sql`SELECT count(*)::int AS n FROM pending_deliveries`;
      assert(after.n >= before, "the queue did not reach the node's delivery");
      assertEquals(await readAll(b, chatId, matchId, 3), ["привет", "я у моста", "в синей куртке"]);
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "a line said after the consent does not overtake the queue",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, matchId } = await waitingMatch(sql);
      a.queueLine(matchId, "первая");
      const chatId = (await b.consent(matchId)).body.chat_id!;
      // No flush called by the face: saying the next line sends the queue first.
      assertEquals((await a.sayInChat(chatId, "вторая", matchId)).status, 202);
      assertEquals(a.queued(matchId), [], "a line said after the consent went out and left the queue behind");
      assertEquals(await readAll(b, chatId, matchId, 2), ["первая", "вторая"]);
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "\"not now\" takes the queue with it",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, matchId } = await waitingMatch(sql);
      a.queueLine(matchId, "не отправится");
      const declined = await a.decline(matchId);
      assert(declined.status >= 200 && declined.status < 300, `"not now" was refused: ${declined.status}`);
      assertEquals(a.queued(matchId), [], "the queue outlived \"not now\"");
    } finally {
      await sql.end();
    }
  },
});
