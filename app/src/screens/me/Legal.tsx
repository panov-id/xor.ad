// w4_legal ("Documents"): when a text changed since this device accepted it, a yellow line says so; the three
// documents as rows (each opens its text on the storefront), the changed ones marked; "I accept the new terms" and
// Accept. The web's Legal through the SDK's calls (depth/core/legal.ts: readManifest, toAccept, acceptAll, the
// same per-identity key), so what one face accepted the other knows. Testids: legal-doc-<doc> (data-changed),
// legal-agree, legal-accept, legal-all, error.
import { useEffect, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { acceptAll, acceptedKey, documentAddress, inLegalOrder, keepAcceptedIn, type LegalRevision, readAcceptedIn, readManifest, toAccept } from "@sdk/legal.ts";
import { brand } from "@brand";
import { failedLine, LANG, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { check, clock } from "../../shell/icons";
import { doc } from "./icons";
import { dayMonth, revisionDay } from "./me-logic";
import { Banner, ErrorLine, Row, SubPage } from "./parts";

const storage = (): Storage | null => { try { return localStorage; } catch { return null; } };

export function Legal({ client, onDone, onBack }: { client: Client; onDone: () => void; onBack: () => void }) {
  const [manifest, setManifest] = useState<LegalRevision[] | null | undefined>(undefined);
  const [pending, setPending] = useState<LegalRevision[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = acceptedKey(brand.name, client.identityId ?? "");
  async function load() {
    try {
      const m = await readManifest(client);
      setManifest(m);
      setPending(m && client.identityId ? toAccept(m, readAcceptedIn(storage(), key)) : []);
      setAgreed(false);
    } catch (e) {
      setError(failedLine(e));
      setManifest(null);
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function accept() {
    if (!agreed || busy || pending.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { accepted, stale } = await acceptAll(client, pending, readAcceptedIn(storage(), key));
      keepAcceptedIn(storage(), key, accepted);
      if (stale) { setError(say("web.legal.stale")); await load(); return; }
      onDone();
    } catch (e) {
      setError(failedLine(e));
    } finally {
      setBusy(false);
    }
  }
  const day = (r: LegalRevision) => dayMonth(LANG, revisionDay(r.revision_date));
  const first = inLegalOrder(pending)[0];
  return (
    <SubPage name="legal" title={say("web.legal.title")} onBack={onBack}
      foot={pending.length > 0 ? (
        <button type="button" className="cta cta-primary" aria-disabled={agreed && !busy ? undefined : true} aria-busy={busy || undefined} onClick={() => void accept()} data-testid="legal-accept">
          <Icon d={check} /><span>{say("app.legal.accept")}</span>
        </button>
      ) : undefined}>
      {first && <Banner tone="yellow" icon={clock} text={say(`app.legal.changed_${first.document}`, { date: day(first) })} testid="legal-changed" />}
      {manifest === undefined && <p className="me-quiet">…</p>}
      {manifest && (
        <ul className="me-list">
          {inLegalOrder(manifest).map((r) => {
            const changed = pending.some((p) => p.document === r.document);
            return (
              <li key={r.document} data-testid={`legal-doc-${r.document}`} data-changed={changed ? "yes" : "no"}>
                <Row icon={doc} text={say(`app.legal.${r.document}`)} sub={changed ? say("app.legal.changed") : undefined} value={day(r)}
                  href={documentAddress(brand.host, r.document)} testid={`legal-link-${r.document}`} />
              </li>
            );
          })}
        </ul>
      )}
      {pending.length > 0 ? (
        <label className="reg-check me-agree">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="legal-agree" />
          <span className="reg-box" aria-hidden="true"><Icon d={check} /></span>
          <span>{say("app.legal.agree")}</span>
        </label>
      ) : manifest && <p className="me-quiet" data-testid="legal-all">{say("web.legal.accepted")}</p>}
      <ErrorLine text={error} />
    </SubPage>
  );
}
