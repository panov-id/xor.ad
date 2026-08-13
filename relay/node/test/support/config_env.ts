// A test states the configuration it needs, instead of inheriting whatever the
// process happens to be holding.
//
// config.ts used to read the environment exactly once, at import. Test files set
// their variables at module load, so whichever file loaded first decided the
// configuration for every file after it — and the symptom was never "another
// file set BRANDS". It was three welcome tests failing with a TypeError inside
// welcome.ts, pointing at a line that had nothing to do with it. CI worked
// around it by running one suite in a process of its own, which hid the problem
// for the one file that was known to leak and left every other file depending on
// alphabetical order.
//
// So: reloadConfig() makes the configuration re-readable, and this makes each
// suite say what it wants. Everything not named in `overrides` is cleared, which
// is the part that matters — inheriting a leftover is exactly the failure.

import { reloadConfig } from "../../src/config.ts";

// Every variable config.ts reads. Anything missing from this list is a variable
// one suite can still leak into another, so it is worth keeping complete.
const CONFIGURED = [
  "NODE_ENV_NAME",
  "NODE_ID",
  "NODE_REGION",
  "PORT",
  "REQUIRE_API_KEY",
  "BRANDS",
  "ALLOWED_ORIGINS",
  "STORAGE_TRANSPORT",
  "STORAGE_DIR",
  "BUNNY_STORAGE_ZONE",
  "BUNNY_STORAGE_KEY",
  "BUNNY_STORAGE_HOST",
  "MAIL_TRANSPORT",
  "MAIL_SMTP_HOST",
  "MAIL_SMTP_PORT",
  "MAIL_FROM_OVERRIDE",
  "RESEND_API_KEY",
  "RESEND_KEYS",
  "WELCOME_FROM",
  "SESSION_SECRET",
  "PANEL_URL",
  "PANEL_SENDER",
  "ORIGIN_TOKEN",
  "DATABASE_URL",
];

export function useEnvironment(overrides: Record<string, string> = {}): void {
  for (const name of CONFIGURED) {
    if (name in overrides) Deno.env.set(name, overrides[name]);
    else Deno.env.delete(name);
  }
  reloadConfig();
}

// Wraps Deno.test so the configuration is applied before each case rather than
// once per file — a file's tests run interleaved with nothing, but its *file*
// runs after other files, and that was enough.
export function suite(overrides: Record<string, string> | (() => Record<string, string>)) {
  const apply = () => useEnvironment(typeof overrides === "function" ? overrides() : overrides);

  // Both shapes Deno.test takes, because both are in use: a name and a body, and
  // a definition object for the suites that need to relax a sanitizer.
  function configured(name: string, body: () => unknown | Promise<unknown>): void;
  function configured(definition: Deno.TestDefinition): void;
  function configured(
    first: string | Deno.TestDefinition,
    body?: () => unknown | Promise<unknown>,
  ): void {
    if (typeof first === "string") {
      Deno.test(first, async () => {
        apply();
        await body!();
      });
      return;
    }
    const { fn, ...rest } = first;
    Deno.test({
      ...rest,
      async fn(context) {
        apply();
        await fn(context);
      },
    });
  }

  return configured;
}
