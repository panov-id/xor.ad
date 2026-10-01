// The legal revisions a brand's people accept (protocol §4.1, chat spec §8.2):
// the terms, the privacy policy and the guidelines, each a date and the sha256
// of its English original, which governs every translation. Decided in the
// storefront repositories (deploy/legal-revisions.json there, held by their
// check-legal-revisions.py) and copied here per brand by
// scripts/sync-legal-revisions.sh, whose --check is in check-all (loop,
// 2026-09-24). Read once per brand and kept: the file changes with the image.

import { query } from "./db.ts";
import { json } from "./http.ts";
import { inc } from "./metrics.ts";
import { sunsetHeader } from "./identity_auth.ts";

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

// The node enforces `required` (chat spec §8.2 :851-858; W13-LN): a person
// without the latest revision of every required document neither publishes
// nor opens a chat. Behind LEGAL_REQUIRED=1 — off until the faces ask for
// acceptance (W13-LC), so that no registration fixture goes red for a text
// nobody was shown. Read once, with the rest of the environment.
export const LEGAL_REQUIRED = Deno.env.get("LEGAL_REQUIRED") === "1";

// The required revisions this identity has not accepted — empty means go on.
// A face with no revisions on this node, or no face at all (a native key),
// asks nothing: there is no text to have accepted.
export async function acceptedLatest(identityId: string, brand: string | null): Promise<Revision[]> {
  if (!brand) return [];
  const required = ((await revisionsOf(brand)) ?? []).filter((r) => r.reaccept === "required");
  if (required.length === 0) return [];
  const rows = await query<{ document: string; revision_sha256: string }>(
    `SELECT document, revision_sha256 FROM legal_acceptances WHERE identity = $1`,
    [identityId],
  );
  if (rows === null) return required;
  return required.filter((r) => !rows.some((a) => a.document === r.document && a.revision_sha256 === r.revision_sha256));
}

// The gate a route puts after callerOf: null to go on, else the 409 in the
// form the core reads — `error` the string, and the documents to accept
// (openapi LegalReacceptance; depth/core/client.ts conflictOf).
export async function legalGate(caller: { identityId: string; brand: string | null }): Promise<Response | null> {
  if (!LEGAL_REQUIRED) return null;
  const missing = await acceptedLatest(caller.identityId, caller.brand);
  if (missing.length === 0) return null;
  inc("relay_legal_gate_total", { result: "refused" });
  return json({
    error: "legal_reacceptance_required",
    documents: missing.map(({ document, revision_date, revision_sha256 }) => ({ document, revision_date, revision_sha256 })),
  }, 409, sunsetHeader());
}
