// The tenancy boundary is only as good as the rule that nothing bypasses it:
// a route that imports put/get/list straight from storage.ts writes outside its
// tenant's prefix and nothing in the type system objects. So the rule is a test.
//
// Only the data functions are banned. `storageEnabled` is a capability check
// that touches nothing, and type-only imports carry no behaviour.
import { assert } from "jsr:@std/assert@1";

import { suite } from "./support/config_env.ts";

// This suite states its own configuration; see test/support/config_env.ts.
const configured = suite({});

const DATA_FUNCTIONS = ["put", "get", "del", "list", "listDetailed", "exists"];

// Modules that legitimately reach storage directly:
//   scoped_storage — the boundary itself
//   auth, log, audit, brand_registry, api_key — platform-wide data that lives
//   outside tenants/ by definition (sessions, the node's own log, the trail,
//   the tenant registry, the keys that name a tenant)
const ALLOWED = new Set([
  "src/lib/scoped_storage.ts",
  "src/lib/auth.ts",
  "src/lib/log.ts",
  "src/lib/audit.ts",
  "src/lib/brand_registry.ts",
  "src/lib/api_key.ts",
  "src/lib/storage.ts",
]);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of Deno.readDirSync(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) yield* sourceFiles(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

configured("nothing outside the allowlist imports storage data functions", () => {
  const offenders: string[] = [];
  for (const path of sourceFiles("src")) {
    if (ALLOWED.has(path)) continue;
    const source = Deno.readTextFileSync(path);
    // Every import from storage.ts, not the first: a file may have two, and the
    // second was the one nobody looked at.
    const named = [...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"[^"]*storage\.ts"/g)];
    for (const [, inside] of named) {
      for (const clause of inside.split(",")) {
        // `put as write` binds `write` and used to be read as importing `write`,
        // which is in no list — so an alias walked straight through the guard.
        // What matters is the name on the left: that is what was imported.
        const imported = clause.trim().split(/\s+as\s+/)[0].trim();
        if (DATA_FUNCTIONS.includes(imported)) offenders.push(`${path}: ${imported}`);
      }
    }
    // The two ways to take the module whole. Neither names a function, so a
    // check that reads names could never see them.
    if (/import\s+\*\s+as\s+\w+\s+from\s+"[^"]*storage\.ts"/.test(source)) {
      offenders.push(`${path}: import * as … from storage.ts`);
    }
    if (/await\s+import\(\s*"[^"]*storage\.ts"\s*\)/.test(source)) {
      offenders.push(`${path}: await import("…/storage.ts")`);
    }
  }
  assert(
    offenders.length === 0,
    `these must go through scoped_storage.ts instead:\n${offenders.join("\n")}`,
  );
});
