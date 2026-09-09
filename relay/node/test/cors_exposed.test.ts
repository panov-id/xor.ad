// What a browser is allowed to read off our answers.
//
// A cross-origin response arrives at the page with every header stripped except
// a short safelist — anything of ours has to be named in
// `access-control-expose-headers` or it simply is not there. It never was, and
// the panel's data provider reads `x-total-count` to know how many rows exist
// (panel/src/providers/data.ts). Across origins — which is every real
// deployment, the panel on one host and the node on another — that read returned
// null and fell back to "as many as arrived on this page". So the answer to "how
// many notices are open" was quietly the size of one page for as long as the
// provider had existed. A review lens found it on 2026-09-08; no test had ever
// looked at the header list.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const ORIGIN = "https://panel.test";
const configured = suite({ ALLOWED_ORIGINS: ORIGIN });

const exposed = async (): Promise<string[]> => {
  const { corsHeaders } = await import("../src/lib/cors.ts");
  const value = corsHeaders(ORIGIN)["access-control-expose-headers"] ?? "";
  return value.split(",").map((name) => name.trim().toLowerCase()).filter(Boolean);
};

configured("the counts a page needs are readable across origins", async () => {
  const names = await exposed();
  for (const header of ["x-total-count", "x-platform-count"]) {
    assert(
      names.includes(header),
      `${header} is not exposed, so the panel reads null and falls back to the page size`,
    );
  }
});

configured("and so is the request id, which is what a bug report quotes", async () => {
  assert((await exposed()).includes("x-request-id"));
});

configured("an origin we do not allow is told nothing at all", async () => {
  const { corsHeaders } = await import("../src/lib/cors.ts");
  assertEquals(Object.keys(corsHeaders("https://elsewhere.test")).length, 0);
});
