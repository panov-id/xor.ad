// Room.next after a timeout (verifier, 2026-09-27): the reader that gave up
// used to stay in line, and the next frame went to its rejected promise.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { Room } from "./client.ts";

class FakeSocket {
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  readyState = 1;
  protocol = "xor.p1";
  addEventListener() {}
  close() {}
  send(frame: object) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}

Deno.test("a frame after a reader timed out goes to the next reader, not to the one that gave up", async () => {
  const socket = new FakeSocket();
  const room = new Room(socket as unknown as WebSocket);
  await assertRejects(() => room.next(10), Error, "no frame within the time");
  socket.send({ type: "line", seq: 1, data: { id: "a" } });
  const got = await room.next(100);
  assertEquals(got.seq, 1, "the frame after a timeout was lost");
});
