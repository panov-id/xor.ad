// What a browser is allowed to send us, across origins.
//
// A cross-origin request with any header outside the safelist is preceded by
// a preflight, and the browser sends the request only if every such header is
// named in `access-control-allow-headers`. Until 2026-09-26 the list held the
// panel's three and nothing of a person's signed call — x-protocol-version and
// the session's x-identity-session, -time and -sign (lib/identity_auth.ts) —
// so a web face on its own origin could not register, read the feed or do
// anything signed: the browser refused before the node saw a byte. The first
// web face (W1) worked only by forwarding through its own server. The list
// here is held to what the node reads from a request, so a header the node
// starts reading tomorrow is caught tomorrow, not by a person's browser.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const ORIGIN = "https://sosed.test";
const configured = suite({ ALLOWED_ORIGINS: ORIGIN });

const names = (value: string | undefined): string[] =>
  (value ?? "").split(",").map((n) => n.trim().toLowerCase()).filter(Boolean);

// What the node reads off a signed request, by the one module that verifies
// it — the four names its comments say a client sends.
const SIGNED = ["x-protocol-version", "x-identity-session", "x-identity-time", "x-identity-sign"];

configured("a preflight allows every header a signed call carries", async () => {
  const { handlePreflight } = await import("../src/lib/cors.ts");
  const answer = handlePreflight(ORIGIN);
  assertEquals(answer.status, 204);
  const allowed = names(answer.headers.get("access-control-allow-headers") ?? undefined);
  for (const header of ["authorization", "content-type", "x-api-key", ...SIGNED]) {
    assert(allowed.includes(header), `${header} is not allowed on a preflight — the browser refuses the signed call before the node sees it`);
  }
  assertEquals(answer.headers.get("access-control-allow-origin"), ORIGIN);
});

configured("a preflight through the dispatcher answers the same", async () => {
  const { dispatch } = await import("../src/dispatch.ts");
  const answer = await dispatch(
    new Request("https://node.test/feed", {
      method: "OPTIONS",
      headers: {
        origin: ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": [...SIGNED, "content-type", "x-api-key"].join(", "),
      },
    }),
  );
  assertEquals(answer.status, 204);
  const allowed = names(answer.headers.get("access-control-allow-headers") ?? undefined);
  for (const header of SIGNED) assert(allowed.includes(header), `${header} missing from the dispatcher's preflight`);
});

configured("the allowed list is exactly what the node reads from a request, plus the panel's", async () => {
  // The source of truth is the code that reads the headers: every
  // headers.get("x-…") in src, except the ones the edge sets and the node
  // trusts from it (never from a browser) and the metrics scraper's token.
  const { SIGNED_REQUEST_HEADERS } = await import("../src/lib/cors.ts");
  const read = new Set<string>();
  for await (const entry of walk(new URL("../src/", import.meta.url))) {
    const text = await Deno.readTextFile(entry);
    for (const m of text.matchAll(/headers\.get\("(x-[a-z-]+)"\)/g)) read.add(m[1]);
  }
  const edgeOnly = new Set(["x-forwarded-for", "x-real-ip", "x-client-ip", "x-origin-token", "x-metrics-token"]);
  const fromBrowser = [...read].filter((h) => !edgeOnly.has(h)).sort();
  const listed = SIGNED_REQUEST_HEADERS.filter((h) => h.startsWith("x-")).sort();
  assertEquals(listed, fromBrowser, "the node reads a header from a browser that the preflight does not allow, or allows one nobody reads");
});

configured("what a person's client reads off an answer is exposed", async () => {
  const { corsHeaders } = await import("../src/lib/cors.ts");
  const exposed = names(corsHeaders(ORIGIN)["access-control-expose-headers"]);
  for (const header of ["retry-after", "x-protocol-sunset"]) {
    assert(exposed.includes(header), `${header} is not exposed — depth/core/client.ts reads it and gets null across origins`);
  }
});

async function* walk(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walk(url);
    else if (entry.name.endsWith(".ts")) yield url;
  }
}
