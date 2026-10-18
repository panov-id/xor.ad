// ChatSession (chat_state.ts) on stand-ins for the client, the chat keys and the room: what the web's screen
// did through useChat now happens here, for both faces. No node, no socket.

import { assert, assertEquals } from "jsr:@std/assert@1";
import type { Client } from "../../core/client.ts";
import { ChatSession } from "./chat_state.ts";
import type { ChatKeys, InboxChatRow } from "./keys.ts";
import type { RoomEvent } from "./room.ts";

const NOW = 1_800_000_000;
const row = (over: Partial<InboxChatRow> = {}): InboxChatRow => ({
  kind: "chat", id: "chat-1", me: "me-1", key_epoch: 1, rekey_requested: false,
  peer: { key_epoch: 1, identity_id: "peer-1", identity_public_key: "pk" },
  name: "Борис", age: 31, state: "open", chat_expires_at: NOW + 60, my_span: 10, ...over,
});

function stand(opts: { sayAnswer?: { status: number; body: { accepted?: boolean } }; readFails?: boolean; inboxRow?: InboxChatRow } = {}) {
  let room: ((e: RoomEvent) => void) | null = null;
  const received: string[] = [];
  const said: Array<{ text: string; localId?: string }> = [];
  let n = 0;
  const client = {
    inbox: async () => [opts.inboxRow ?? row()],
    received: async (_: string, ids: string[]) => { received.push(...ids); },
  } as unknown as Client;
  const keys = {
    open: async () => ({}),
    flush: async () => [],
    keptOnNode: () => ({ epoch: 1 }),
    read: async (_r: unknown, ciphertext: string) => { if (opts.readFails) throw new Error("bad seal"); return `opened:${ciphertext}`; },
    say: async (_r: unknown, text: string, localId?: string) => {
      said.push({ text, localId });
      return { localId: localId ?? `local-${++n}`, answer: opts.sayAnswer ?? { status: 202, body: { accepted: true } } };
    },
    requestRekey: async () => ({ status: 200, body: { state: "asked", epoch: 2 } }),
    acceptRekey: async () => ({ status: 200, body: { state: "agreed", epoch: 2 } }),
  } as unknown as ChatKeys;
  const session = new ChatSession({
    client, keys, row: row(), say: (k, v) => `${k}${v ? JSON.stringify(v) : ""}`,
    connect: (_c, _id, on) => { room = on; return { stop: () => { room = null; } }; },
    nowSeconds: () => NOW,
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { session, emit: (e: RoomEvent) => room?.(e), received, said, settle, roomOpen: () => room !== null };
}

Deno.test("ChatSession: the keys open on start, and the status says so", async () => {
  const { session, settle } = stand();
  assertEquals(session.view().keysState, "opening");
  session.start();
  await settle(); await settle();
  assertEquals(session.view().keysState, "open");
  assertEquals(session.view().status, { key: "web.chat.keys_ready" });
  assertEquals(session.view().kept, { epoch: 1 });
  session.stop();
});

Deno.test("ChatSession: their line opens, is marked received and takes the away mark off", async () => {
  const { session, emit, received, settle } = stand();
  session.start(); await settle();
  emit({ kind: "sys", data: { kind: "peer_stepped_away" } });
  assertEquals(session.view().peerAway, true);
  emit({ kind: "message", id: "m1", ciphertext: "c1", createdAt: NOW });
  await settle(); await settle();
  const v = session.view();
  assertEquals(v.lines.map((l) => [l.id, l.text, l.mine]), [["m1", "opened:c1", false]]);
  assertEquals(received, ["m1"]);
  assertEquals(v.peerAway, false);
  session.stop();
});

Deno.test("ChatSession: a line that does not open shows as failed with the face's words", async () => {
  const { session, emit, settle } = stand({ readFails: true });
  session.start(); await settle();
  emit({ kind: "message", id: "m2", ciphertext: "c2", createdAt: NOW });
  await settle(); await settle();
  const line = session.view().lines[0];
  assertEquals(line.state, "failed");
  assertEquals(line.text, 'web.chat.not_opened{"message":"bad seal"}');
  session.stop();
});

Deno.test("ChatSession: my line goes out, resets my silence to now + span", async () => {
  const { session, said, settle } = stand();
  session.start(); await settle();
  assertEquals(session.view().endsAt, NOW + 60); // the row's end, a minute left
  assert(await session.send("привет"));
  const v = session.view();
  assertEquals(said.map((s) => s.text), ["привет"]);
  assertEquals(v.lines.at(-1)?.state, "sent");
  assertEquals(v.endsAt, NOW + 10 * 60);
  session.stop();
});

Deno.test("ChatSession: a line the node did not store waits in the resend schedule, the field may clear", async () => {
  const { session, settle } = stand({ sayAnswer: { status: 202, body: { accepted: false } } });
  session.start(); await settle();
  assert(await session.send("ещё раз"));
  assertEquals(session.view().lines.at(-1)?.state, "failed");
  session.stop(); // the timer goes with the session: the test ends without a leak
});

Deno.test("ChatSession: 404 on send is the end of the chat", async () => {
  const { session, settle } = stand({ sayAnswer: { status: 404, body: {} } });
  session.start(); await settle();
  assertEquals(await session.send("алло"), false);
  assertEquals(session.view().over, true);
  assertEquals(session.view().status, { key: "web.chat.over" });
  session.stop();
});

Deno.test("ChatSession: the room's over and an age change", async () => {
  const { session, emit, settle } = stand();
  session.start(); await settle();
  emit({ kind: "sys", data: { kind: "age_changed", age: 32 } });
  assertEquals(session.view().peerAge, 32);
  assertEquals(session.view().lines.at(-1)?.system, true);
  emit({ kind: "over" });
  assertEquals(session.view().over, true);
  session.stop();
});

Deno.test("ChatSession: a proposal frame opens the game and bumps it; a board only bumps", async () => {
  const { session, emit, settle } = stand();
  session.start(); await settle();
  emit({ kind: "sys", data: { type: "board" } });
  assertEquals([session.view().gameOpen, session.view().gameBump], [false, 1]);
  emit({ kind: "sys", data: { type: "proposal" } });
  assertEquals([session.view().gameOpen, session.view().gameBump], [true, 2]);
  session.stop();
});

Deno.test("ChatSession: an extra like is a card and a starter, once", async () => {
  const { session, emit, settle } = stand();
  session.start(); await settle();
  const e: RoomEvent = { kind: "extra_like", position: 3, text: "кофе", mode: "talk", direction: "they_liked_yours" };
  emit(e); emit(e);
  assertEquals(session.view().lines.filter((l) => l.extra).length, 1);
  assertEquals(session.view().starters, [{ position: 3, text: "кофе", mode: "talk", liked_by: "them" }]);
  session.stop();
});

Deno.test("ChatSession: the silence lapsing ends an open chat, not one whose keys are still opening", async () => {
  const { session, settle } = stand();
  session.silenceLapsed();
  assertEquals(session.view().over, false);
  session.start(); await settle(); await settle();
  session.silenceLapsed();
  assertEquals(session.view().over, true);
  session.stop();
});

Deno.test("ChatSession: an ended row is over from the start and opens no room", async () => {
  let rooms = 0;
  const keys = { open: async () => ({}), flush: async () => [], keptOnNode: () => null } as unknown as ChatKeys;
  const client = { inbox: async () => [] } as unknown as Client;
  const ended = new ChatSession({ client, keys, row: row({ state: "ended" }), say: (k) => k, connect: () => { rooms++; return { stop() {} }; }, nowSeconds: () => NOW });
  assertEquals(ended.view().over, true);
  ended.start(); await new Promise((r) => setTimeout(r, 0));
  assertEquals(rooms, 0);
  ended.stop();
});

Deno.test("ChatSession: after stop nothing changes the view and listeners are gone", async () => {
  const { session, emit, settle } = stand();
  let calls = 0;
  session.subscribe(() => calls++);
  session.start(); await settle();
  const before = calls;
  session.stop();
  emit({ kind: "over" });
  assertEquals(calls, before);
  assertEquals(session.view().over, false);
});
