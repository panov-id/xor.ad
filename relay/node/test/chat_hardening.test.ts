// The tails of the step-5 panel (2026-09-21) that need no decision: the
// Origin allowlist on the upgrade, 1001 when the node stops, and — with a
// database — the index the pending sweeper walks and the chat sweeper's
// batches. Each was red before its code.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({ ALLOWED_ORIGINS: "https://sosed.place" });

configured("a browser origin outside the allowlist does not get a room", async () => {
  {
    const { relayUpgrade } = await import("../src/chat/relay.ts");
    const upgrade = (origin: string | null) =>
      relayUpgrade(new Request("https://relay.test/chat", {
        headers: {
          upgrade: "websocket", connection: "upgrade",
          "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", "sec-websocket-version": "13",
          "sec-websocket-protocol": "xor.p1, ticket.nothing",
          ...(origin ? { origin } : {}),
        },
      }));
    assertEquals((await upgrade("https://evil.example")).status, 403, "a foreign origin was let through to the ticket");
    // No origin at all is a terminal, not a browser: it passes to the ticket check.
    const terminal = await upgrade(null);
    assert(terminal.status !== 403, `a terminal was refused as a foreign origin: ${terminal.status}`);
  }
});

Deno.test("stopping the node closes every room with 1001, so the client knows to come back", async () => {
  const { closeAllRooms, roomsForTest } = await import("../src/chat/relay.ts");
  const closed: Array<[number, string]> = [];
  const fake = (): WebSocket => ({ close: (code: number, reason: string) => closed.push([code, reason]) } as unknown as WebSocket);
  const a = { socket: fake(), session: "s1", chat: "c1", seq: 0 };
  const b = { socket: fake(), session: "s2", chat: "c1", seq: 0 };
  const c = { socket: fake(), session: "s3", chat: "c2", seq: 0 };
  roomsForTest().set("c1", new Set([a, b]));
  roomsForTest().set("c2", new Set([c]));
  assertEquals(closeAllRooms(), 3);
  assertEquals(closed.map(([code]) => code), [1001, 1001, 1001]);
  assert(closed.every(([, reason]) => reason.length > 0), "1001 without a reason");
  assertEquals(roomsForTest().size, 0, "the registry kept rooms after closing them");
});

// pg-driver panel 2026-10-09, item 1: NOTIFY sent while the LISTEN connection
// was down is lost, so a frozen session's room would stay open. The owner's
// decision: every room closes 1012 and the client comes back through the check.
Deno.test("a lost LISTEN connection closes every room with 1012, so the client reconnects and rereads", async () => {
  const { roomsForTest } = await import("../src/chat/relay.ts");
  const { listenWasLost } = await import("../src/lib/db.ts");
  const closed: Array<[number, string]> = [];
  const fake = (): WebSocket => ({ close: (code: number, reason: string) => closed.push([code, reason]) } as unknown as WebSocket);
  roomsForTest().set("c1", new Set([{ socket: fake(), session: "s1", chat: "c1", seq: 0 }]));
  roomsForTest().set("c2", new Set([{ socket: fake(), session: "s2", chat: "c2", seq: 0 }]));
  listenWasLost();
  assertEquals(closed.map(([code]) => code), [1012, 1012], "an open room outlived the lost LISTEN connection, or closed with the wrong code");
  assert(closed.every(([, reason]) => reason.length > 0), "1012 without a reason");
  assertEquals(roomsForTest().size, 0, "the registry kept rooms after the LISTEN connection was lost");
});
