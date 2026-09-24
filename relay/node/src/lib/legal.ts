// The legal revisions a brand's people accept (protocol §4.1, chat spec §8.2):
// the terms, the privacy policy and the guidelines, each a date and the sha256
// of its English original, which governs every translation. Decided in the
// storefront repositories (deploy/legal-revisions.json there, held by their
// check-legal-revisions.py) and copied here per brand by
// scripts/sync-legal-revisions.sh, whose --check is in check-all (loop,
// 2026-09-24). Read once per brand and kept: the file changes with the image.

export interface Revision {
  document: "terms" | "privacy" | "guidelines";
  revision_date: string;
  revision_sha256: string;
  reaccept: string;
}

const cache = new Map<string, Revision[] | null>();

export async function revisionsOf(brand: string): Promise<Revision[] | null> {
  if (cache.has(brand)) return cache.get(brand)!;
  let found: Revision[] | null = null;
  if (/^[a-z0-9-]{1,40}$/.test(brand)) {
    try {
      const raw = JSON.parse(await Deno.readTextFile(new URL(`../../legal/${brand}.json`, import.meta.url))) as {
        documents?: Record<string, { date?: string; sha256?: string; reaccept?: string }>;
      };
      found = Object.entries(raw.documents ?? {})
        .filter(([name, d]) => ["terms", "privacy", "guidelines"].includes(name) && d.date && d.sha256)
        .map(([name, d]) => ({
          document: name as Revision["document"],
          revision_date: d.date!,
          revision_sha256: d.sha256!,
          reaccept: d.reaccept ?? "required",
        }))
        .sort((a, b) => a.document.localeCompare(b.document));
    } catch {
      found = null;
    }
  }
  cache.set(brand, found);
  return found;
}
