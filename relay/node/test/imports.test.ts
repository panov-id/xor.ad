// The tenancy boundary is only as good as the rule that nothing bypasses it:
// a route that imports put/get/list straight from storage.ts writes outside its
// tenant's prefix and nothing in the type system objects. So the rule is a test.
//
// Only the data functions are banned. `storageEnabled` is a capability check
// that touches nothing, and type-only imports carry no behaviour.
import { assert } from "jsr:@std/assert@1";

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

Deno.test("nothing outside the allowlist imports storage data functions", () => {
  const offenders: string[] = [];
  for (const path of sourceFiles("src")) {
    if (ALLOWED.has(path)) continue;
    const source = Deno.readTextFileSync(path);
    const importLine = source.match(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"[^"]*storage\.ts"/);
    if (!importLine) continue;
    const bound = importLine[1].split(",").map((name) => name.trim().split(/\s+/).pop());
    const banned = bound.filter((name) => name && DATA_FUNCTIONS.includes(name));
    if (banned.length > 0) offenders.push(`${path}: ${banned.join(", ")}`);
  }
  assert(
    offenders.length === 0,
    `these must go through scoped_storage.ts instead:\n${offenders.join("\n")}`,
  );
});
