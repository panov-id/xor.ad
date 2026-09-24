// The body's ceiling (lib/body_limit.ts): counted on the stream, not taken
// from content-length. No server and no database — the function is the rule.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { BODY_MAX_BYTES, capBody } from "../src/lib/body_limit.ts";

const URL_ = "https://node.example/v1/waitlist";

function streamOf(total: number, chunk = 64 * 1024): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= total) return controller.close();
      const n = Math.min(chunk, total - sent);
      sent += n;
      controller.enqueue(new Uint8Array(n).fill(0x61));
    },
  });
}

async function refused(result: Request | Response): Promise<void> {
  assert(result instanceof Response, "a body over the ceiling was let through");
  assertEquals(result.status, 413);
  assertEquals(((await result.json()) as { error: { code: string } }).error.code, "invalid_body");
}

Deno.test("a body declared over the ceiling is refused before it is read", async () => {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(1024)); } });
  const req = new Request(URL_, {
    method: "POST", body, headers: { "content-length": String(BODY_MAX_BYTES + 1) },
  });
  await refused(await capBody(req));
  assert(pulled <= 1, `the body was read though its length already refused it (${pulled} pulls)`);
});

Deno.test("a stream with no length is stopped at the ceiling", async () => {
  await refused(await capBody(new Request(URL_, { method: "POST", body: streamOf(BODY_MAX_BYTES + 1) })));
});

Deno.test("a length that lies small does not let a large stream through", async () => {
  const req = new Request(URL_, {
    method: "POST", body: streamOf(3 * BODY_MAX_BYTES), headers: { "content-length": "10" },
  });
  await refused(await capBody(req));
});

Deno.test("a body at the ceiling passes whole, with its headers", async () => {
  const req = new Request(URL_, {
    method: "POST", body: streamOf(BODY_MAX_BYTES), headers: { "x-sig": "kept" },
  });
  const passed = await capBody(req);
  assert(passed instanceof Request, "a body at the ceiling was refused");
  assertEquals(passed.method, "POST");
  assertEquals(passed.url, URL_);
  assertEquals(passed.headers.get("x-sig"), "kept");
  const bytes = new Uint8Array(await passed.arrayBuffer());
  assertEquals(bytes.length, BODY_MAX_BYTES);
  assert(bytes.every((b) => b === 0x61), "the bytes changed on the way");
});

// A socket upgrade is a GET the node must hand to Deno.upgradeWebSocket as it
// came: a copied Request cannot be upgraded.
Deno.test("a request with no body is handed on as the same object", async () => {
  const req = new Request(URL_, { method: "GET" });
  assert((await capBody(req)) === req, "a bodiless request was copied");
});
