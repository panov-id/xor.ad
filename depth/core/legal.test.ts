// The core's side of accepting legal revisions (W13-LC): what is still to
// accept, the node's 409 read into documents, the manifest's 503 as "nothing
// to ask", and acceptAll stopping on a stale revision. No node: the client is
// a stand-in with the two calls the core makes.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { acceptAll, fromRefusal, type LegalRevision, readManifest, toAccept } from "./legal.ts";

const T: LegalRevision = { document: "terms", revision_date: "2026-09-01", revision_sha256: "a".repeat(64), reaccept: "required" };
const P: LegalRevision = { document: "privacy", revision_date: "2026-09-01", revision_sha256: "b".repeat(64), reaccept: "required" };
const G: LegalRevision = { document: "guidelines", revision_date: "2026-09-15", revision_sha256: "c".repeat(64), reaccept: "required" };

Deno.test("at registration all three are to accept; later only the changed one", () => {
  assertEquals(toAccept([T, P, G], {}).map((r) => r.document), ["terms", "privacy", "guidelines"]);
  const accepted = { terms: T.revision_sha256, privacy: P.revision_sha256, guidelines: "0".repeat(64) };
  assertEquals(toAccept([T, P, G], accepted).map((r) => r.document), ["guidelines"]);
  assertEquals(toAccept([T, P, G], { ...accepted, guidelines: G.revision_sha256 }), []);
});

Deno.test("the node's 409 names the documents to accept; any other answer names none", () => {
  const body = { error: "legal_reacceptance_required", documents: [{ document: "privacy", revision_date: P.revision_date, revision_sha256: P.revision_sha256 }, { document: "nonsense" }] };
  assertEquals(fromRefusal({ status: 409, body }).map((r) => r.document), ["privacy"]);
  assertEquals(fromRefusal({ status: 409, body: { error: { code: "name_frozen" } } }), []);
  assertEquals(fromRefusal({ status: 200, body }), []);
});

Deno.test("a face with no revisions asks nothing; another refusal is an error", async () => {
  assertEquals(await readManifest({ legalManifest: () => Promise.resolve({ status: 503, body: null }) }), null);
  assertEquals((await readManifest({ legalManifest: () => Promise.resolve({ status: 200, body: { documents: [T, P, G] } }) }))!.length, 3);
  await assertRejects(() => readManifest({ legalManifest: () => Promise.resolve({ status: 401, body: null }) }));
});

Deno.test("acceptAll sends each revision and stops on a stale one with what went through", async () => {
  const sent: string[] = [];
  const ok = await acceptAll({ legalAccept: (d) => { sent.push(d); return Promise.resolve({ status: 200 }); } }, [T, P, G]);
  assertEquals(sent, ["terms", "privacy", "guidelines"]);
  assertEquals(ok, { accepted: { terms: T.revision_sha256, privacy: P.revision_sha256, guidelines: G.revision_sha256 }, stale: null });
  const stale = await acceptAll({ legalAccept: (d) => Promise.resolve({ status: d === "privacy" ? 400 : 200 }) }, [T, P, G]);
  assertEquals(stale, { accepted: { terms: T.revision_sha256 }, stale: P });
});
