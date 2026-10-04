// The legal revisions a person accepts (chat spec §8.2 :851-858; screen 15;
// W13-LC): the face's manifest from GET /legal/manifest, what of it is still
// to accept, and the accept itself, one POST /legal/accept per document.
//
// The node keeps the journal of acceptances but serves no "what did I
// accept": a client knows what it accepted on this device, and the node's
// gate (LEGAL_REQUIRED, W13-LN) answers a publish or a chat with 409
// legal_reacceptance_required and the documents it still wants. Both lead
// here. The texts are the storefront's; the core carries only revisions.

export type LegalDocument = "terms" | "privacy" | "guidelines";

export interface LegalRevision {
  document: LegalDocument;
  revision_date: string;
  revision_sha256: string;
  // "required": not accepted, the person neither publishes nor opens a chat.
  reaccept?: string;
}

// What this device accepted: the sha256 by document.
export type Accepted = Partial<Record<LegalDocument, string>>;

const DOCUMENTS: readonly string[] = ["terms", "privacy", "guidelines"];

function revisionsIn(raw: unknown): LegalRevision[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is LegalRevision =>
    !!d && typeof d === "object" && DOCUMENTS.includes((d as LegalRevision).document) &&
    typeof (d as LegalRevision).revision_sha256 === "string" && typeof (d as LegalRevision).revision_date === "string"
  );
}

// The manifest, or null when the node has none for this face (503): then
// there is nothing to accept and nothing is asked.
export async function readManifest(client: { legalManifest(): Promise<{ status: number; body: unknown }> }): Promise<LegalRevision[] | null> {
  const answer = await client.legalManifest();
  if (answer.status === 503) return null;
  if (answer.status !== 200) throw new Error(`the legal manifest was refused: ${answer.status}`);
  return revisionsIn((answer.body as { documents?: unknown } | null)?.documents);
}

// The revisions still to accept: every document whose current revision this
// device has not accepted. At registration nothing is accepted, so all three.
export function toAccept(manifest: LegalRevision[], accepted: Accepted): LegalRevision[] {
  return manifest.filter((r) => accepted[r.document] !== r.revision_sha256);
}

// The documents a 409 legal_reacceptance_required names (relay lib/legal.ts
// legalGate), or none when the answer is not that refusal.
export function fromRefusal(answer: { status: number; body: unknown }): LegalRevision[] {
  const body = answer.body as { error?: unknown; documents?: unknown } | null;
  if (answer.status !== 409 || body?.error !== "legal_reacceptance_required") return [];
  return revisionsIn(body.documents);
}

// Accept each revision in turn. A 400 means the node serves another revision
// now (read the manifest again); it stops there with what went through.
export async function acceptAll(
  client: { legalAccept(document: string, sha256: string): Promise<{ status: number }> },
  revisions: LegalRevision[],
  accepted: Accepted = {},
): Promise<{ accepted: Accepted; stale: LegalRevision | null }> {
  const now: Accepted = { ...accepted };
  for (const r of revisions) {
    const answer = await client.legalAccept(r.document, r.revision_sha256);
    if (answer.status === 400) return { accepted: now, stale: r };
    if (answer.status !== 200) throw new Error(`the acceptance of ${r.document} was refused: ${answer.status}`);
    now[r.document] = r.revision_sha256;
  }
  return { accepted: now, stale: null };
}
