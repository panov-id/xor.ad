// The resend schedule (chat spec :2388; W14-RS): at once, 5, 15, 45, 135 s,
// then the ten-minute ceiling, and nothing odd from odd input.
import { assertEquals } from "jsr:@std/assert@1";
import { RESEND_CAP_MS, resendPause } from "./resend.ts";

Deno.test("the resend pauses grow ×3 from at once to the ten-minute ceiling", () => {
  const seconds = [0, 1, 2, 3, 4, 5, 6, 20].map((n) => resendPause(n) / 1000);
  assertEquals(seconds, [0, 5, 15, 45, 135, 405, 600, 600]);
  assertEquals(resendPause(1000), RESEND_CAP_MS);
});

Deno.test("a negative or non-number try count goes at once", () => {
  assertEquals([resendPause(-1), resendPause(NaN), resendPause(Infinity)], [0, 0, 0]);
});
