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
import { NdIcon } from "../../shell/NdIcon";
import { dayMonth, revisionDay } from "./me-logic";
import { ErrorLine, SubPage } from "./parts";

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
  // the prototype's legal.html: the documents as tiles (two halves and a whole), the consent on its own panel, Accept at the foot
  const SLOTS: Array<[string, 1 | 3 | 4]> = [["doc", 1], ["eye", 4], ["phrase", 3]];
  return (
    <SubPage name="legal" title={say("web.legal.title")} onBack={onBack} bare footActions
      mid={pending.length > 0 ? (
        <label className="k-check k-consent">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="legal-agree" />
          <span className="k-box" aria-hidden="true"><NdIcon name="check" /></span>
          <span>{say("app.legal.agree")}</span>
        </label>
      ) : manifest ? <p className="k-sub k-me-plain" data-testid="legal-all">{say("web.legal.accepted")}</p> : undefined}
      foot={pending.length > 0 ? (
        <button type="button" className={agreed && !busy ? "cta cta-primary" : "cta cta-quiet"} aria-disabled={agreed && !busy ? undefined : true} aria-busy={busy || undefined} onClick={() => void accept()} data-testid="legal-accept">
          <NdIcon name="check" /><span>{say("app.legal.accept")}</span>
        </button>
      ) : undefined}>
      {first && <p className="k-sr" role="status" data-testid="legal-changed">{say(`app.legal.changed_${first.document}`, { date: day(first) })}</p>}
      {manifest === undefined && <p className="k-sub k-me-plain">…</p>}
      {manifest && (
        <ul className="k-hub" data-hub="legal">
          {inLegalOrder(manifest).map((r, i) => {
            const changed = pending.some((p) => p.document === r.document);
            const [icon, c] = SLOTS[i % SLOTS.length]!;
            return (
              <li key={r.document} data-testid={`legal-doc-${r.document}`} data-changed={changed ? "yes" : "no"} className="k-hub-li" data-wide={i === 2 ? "" : undefined}>
                <a className="k-hub-tile" data-small="" data-wide={i === 2 ? "" : undefined} href={documentAddress(brand.host, r.document)} target="_blank" rel="noopener noreferrer" data-testid={`legal-link-${r.document}`}>
                  <span className="k-badge" data-c={c} aria-hidden="true"><NdIcon name={icon} /></span>
                  <span className="k-stack"><span className="k-row-name">{say(`app.legal.${r.document}`)}</span><span className="k-meta">{changed ? `${say("app.legal.changed")} · ${day(r)}` : day(r)}</span></span>
                  {changed && <span className="k-count" aria-hidden="true">!</span>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <ErrorLine text={error} />
    </SubPage>
  );
}
