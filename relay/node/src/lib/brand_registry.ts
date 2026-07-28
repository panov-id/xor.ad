// The brand registry — the platform's list of tenants. Brands live in storage so
// onboarding a tenant is a write, not a redeploy; the BRANDS env stays as the
// bootstrap seed for the platform's own faces (and for the local stand, which
// has no storage). A stored brand overrides a seeded one with the same key.
//
// Cached with a short TTL rather than read per request: every node in the pool
// holds its own copy, so a registry change lands within TTL everywhere without a
// broadcast. The panel invalidates its own node immediately on write.

import { type Brand, config, isBrandKey } from "../config.ts";
import { get, list, put, storageEnabled } from "./storage.ts";
import { enabled as databaseEnabled, query } from "./db.ts";
import { log } from "./log.ts";

const CACHE_TTL_MS = 60_000;

export const brandsDir = (): string => `platform/${config.envName}/brands`;

let cache: { at: number; brands: Brand[] } | null = null;

export function invalidateBrands(): void {
  cache = null;
}

export async function allBrands(): Promise<Brand[]> {
  const seeded = new Map(config.brands.map((brand) => [brand.key, brand]));

  // With a database the registry is read directly: it is one small query, and a
  // brand added on another node has to be visible here immediately rather than
  // within a cache TTL. The env seeds remain the floor.
  if (databaseEnabled()) {
    const rows = await query<
      { key: string; name: string; domain: string; sender: string; upper: string; match: string[] }
    >(`SELECT key, name, domain, sender, upper, match FROM brands ORDER BY key`);
    if (rows !== null) {
      for (const row of rows) {
        seeded.set(row.key, {
          key: row.key,
          name: row.name,
          domain: row.domain,
          from: row.sender,
          upper: row.upper,
          match: row.match ?? [row.key],
        });
      }
      return [...seeded.values()];
    }
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.brands;
  if (storageEnabled()) {
    try {
      const files = await list(brandsDir());
      const stored = await Promise.all(
        files.map((file) => get<Brand>(`${brandsDir()}/${file}`)),
      );
      for (const brand of stored) {
        // A stored key is checked like a seeded one: the registry is the door
        // self-service onboarding will write through.
        if (!isBrandKey(brand?.key)) {
          if (brand) log("error", "brand registry holds an unusable key, skipped", { brand });
          continue;
        }
        seeded.set(brand.key, brand);
      }
    } catch (error) {
      // A registry read failure must not take the node down: it keeps serving
      // the seeded brands and says so, loudly, in its own log.
      log("error", "brand registry read failed, serving seeds", { error: String(error) });
    }
  }
  cache = { at: Date.now(), brands: [...seeded.values()] };
  return cache.brands;
}

export async function brandByKey(key: string): Promise<Brand | undefined> {
  return (await allBrands()).find((brand) => brand.key === key);
}

// --- writing to it ------------------------------------------------------------

export interface BrandInput {
  key: string;
  name: string;
  domain: string;
  from: string;
  upper?: string;
  match?: string[];
}

// What a brand must have before it is one. Returns the reason rather than a
// boolean, because "invalid brand" is a useless thing to tell someone filling in
// a form.
export function brandProblem(input: Partial<BrandInput>): string | null {
  if (!isBrandKey(input.key)) {
    return "key must be 2-32 characters of a-z, 0-9 and dashes, starting with a letter or digit";
  }
  if (!input.name?.trim()) return "name is required";
  if (!input.domain?.trim()) return "domain is required";
  // The sender is what a recipient sees; a malformed one fails at send time,
  // which is far from here and much harder to read.
  if (!input.from?.includes("@")) return "from must be an email address, optionally with a display name";
  return null;
}

export function toBrand(input: BrandInput): Brand {
  return {
    key: input.key,
    name: input.name.trim(),
    domain: input.domain.trim(),
    from: input.from.trim(),
    upper: input.upper?.trim() || input.name.trim().toUpperCase(),
    // How a keyless caller would be recognised. Kept because the transitional
    // path still uses it on any environment where REQUIRE_API_KEY is off.
    match: input.match?.length ? input.match : [input.key],
  };
}

export async function saveBrand(input: BrandInput): Promise<Brand> {
  const brand = toBrand(input);
  if (databaseEnabled()) {
    const rows = await query(
      `INSERT INTO brands (key, name, domain, sender, upper, match)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name, domain = EXCLUDED.domain, sender = EXCLUDED.sender,
         upper = EXCLUDED.upper, match = EXCLUDED.match, updated_at = now()`,
      [brand.key, brand.name, brand.domain, brand.from, brand.upper, brand.match],
    );
    if (rows === null) throw new Error("could not write the brand to the database");
    invalidateBrands();
    return brand;
  }
  await put(`${brandsDir()}/${brand.key}.json`, brand);
  // This node serves the new brand at once; the others pick it up within the
  // cache TTL, which is what makes onboarding a write rather than a redeploy.
  invalidateBrands();
  return brand;
}

// Seeded brands live in the environment, not in storage, so they cannot be
// edited here — saying so is better than writing an override that shadows the
// seed and confuses the next reader.
export async function isStoredBrand(key: string): Promise<boolean> {
  if (databaseEnabled()) {
    const rows = await query<{ key: string }>("SELECT key FROM brands WHERE key = $1", [key]);
    if (rows !== null) return rows.length > 0;
  }
  if (!storageEnabled()) return false;
  return await get<Brand>(`${brandsDir()}/${key}.json`) !== null;
}
