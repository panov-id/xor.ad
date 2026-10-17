// The legal revisions on the web face (W13-LC; chat spec §8.2 :851-858,
// screen 15): a box per document at registration, sent once the identity
// exists (POST /legal/accept is signed), and screen 15 — every document with
// its revision date, the changed ones marked and offered for acceptance.
// The texts are the storefront's (legal.html?doc=, rules.html), read there;
// the face shows names, dates and boxes, never the text.
//
// What this device accepted is kept here, by identity: the node keeps the
// journal but answers no "what did I accept", so the start-up check compares
// the manifest with this record (core legal.ts toAccept).

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { type Accepted, acceptAll, acceptedKey, documentAddress, keepAcceptedIn, LEGAL_ORDER as ORDER, type LegalDocument, type LegalRevision, readAcceptedIn, readManifest, toAccept } from "../../../depth/core/legal.ts";
import { BRAND, NAMES } from "../config.ts";
import { dateLong, say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Checkbox } from "../ui/Checkbox.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Link } from "../ui/Links.tsx";
import { List, ListItem } from "../ui/List.tsx";
import { Notice } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";

// The order is the core's (legal.ts), one for both faces.
export const LEGAL_ORDER: LegalDocument[] = [...ORDER];

// Where the storefront shows each text (sosed.place and neighbro.place alike).
export function docUrl(doc: LegalDocument): string {
  return documentAddress(NAMES[BRAND] ?? NAMES.sosed, doc);
}

const storeKey = (identityId: string) => acceptedKey(BRAND, identityId);
export function readAccepted(identityId: string): Accepted {
  return readAcceptedIn(localStorage, storeKey(identityId));
}
export function keepAccepted(identityId: string, accepted: Accepted): void {
  keepAcceptedIn(localStorage, storeKey(identityId), accepted);
}

// The start-up check: what changed since this device accepted, or [] when
// the node holds no revisions for the face (503), cannot be asked, or this
// device never accepted anything — a restored or moved-in identity accepted
// on another device, and the node does not say what; for it the node's gate
// (409 legal_reacceptance_required) and screen 15 from "me" are the way.
export async function stillToAccept(client: Client): Promise<LegalRevision[]> {
  if (!client.identityId) return [];
  const accepted = readAccepted(client.identityId);
  if (Object.keys(accepted).length === 0) return [];
  const manifest = await readManifest(client).catch(() => null);
  if (!manifest) return [];
  return toAccept(manifest, accepted);
}

// Accept on the node and keep what went through. Returns a stale revision,
// if the node now serves another one (read the manifest again).
export async function acceptAndKeep(client: Client, revisions: LegalRevision[]): Promise<LegalRevision | null> {
  const id = client.identityId!;
  const { accepted, stale } = await acceptAll(client, revisions, readAccepted(id));
  keepAccepted(id, accepted);
  return stale;
}

const ordered = (list: LegalRevision[]) => [...list].sort((a, b) => LEGAL_ORDER.indexOf(a.document) - LEGAL_ORDER.indexOf(b.document));

// Registration's step one: under the one consent, each text's link and its
// revision date — what the consent accepts.
export function LegalLinks({ revisions }: { revisions: LegalRevision[] }) {
  return (
    <p className="ui-hint" data-testid="legal-links">
      {ordered(revisions).map((r, i) => (
        <span key={r.document}>
          {i > 0 ? " · " : ""}
          <Link href={docUrl(r.document)} external data-testid={`legal-link-${r.document}`}>{say(`web.legal.${r.document}`)}</Link>
          {" "}({say("web.legal.edition", { date: dateLong(r.revision_date) })})
        </span>
      ))}
    </p>
  );
}

// The boxes of screen 15, one per changed revision, each with its text's link.
export function LegalBoxes({ revisions, checked, onCheck }: {
  revisions: LegalRevision[];
  checked: Partial<Record<LegalDocument, boolean>>;
  onCheck: (doc: LegalDocument, on: boolean) => void;
}) {
  return (
    <>
      {ordered(revisions).map((r) => (
        <Checkbox key={r.document} checked={!!checked[r.document]} onChange={(on) => onCheck(r.document, on)} data-testid={`legal-${r.document}`}>
          {say(`web.legal.accept_${r.document}`)}{" "}
          <Link href={docUrl(r.document)} external data-testid={`legal-link-${r.document}`}>{say("web.legal.read")}</Link>
        </Checkbox>
      ))}
    </>
  );
}

// Screen 15: the face's documents, dated; the changed ones marked and boxed.
export function Legal({ client, onDone, onBack }: { client: Client; onDone: () => void; onBack?: () => void }) {
  const [manifest, setManifest] = useState<LegalRevision[] | null | undefined>(undefined);
  const [pending, setPending] = useState<LegalRevision[]>([]);
  const [checked, setChecked] = useState<Partial<Record<LegalDocument, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const m = await readManifest(client);
      setManifest(m);
      setPending(m && client.identityId ? toAccept(m, readAccepted(client.identityId)) : []);
      setChecked({});
    } catch (e) {
      setError((e as Error).message);
      setManifest(null);
    }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const all = pending.length > 0 && pending.every((r) => checked[r.document]);
  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const stale = await acceptAndKeep(client, pending);
      if (stale) { setError(say("web.legal.stale")); await load(); return; }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title = say("web.legal.title");
  return (
    <Screen
      name="legal"
      title={title}
      data-pending={pending.length}
      header={onBack ? <HeaderScreen title={title} onBack={onBack} backLabel={say("common.back")} /> : <HeaderScreen title={title} />}
    >
      {manifest === undefined && <p className="ui-hint">…</p>}
      {manifest && (
        <List label={title}>
          {ordered(manifest).map((r) => {
            const changed = pending.some((p) => p.document === r.document);
            return (
              <ListItem key={r.document} data-testid={`legal-doc-${r.document}`} data-changed={changed ? "yes" : "no"}>
                <Link href={docUrl(r.document)} external block>{say(`web.legal.${r.document}`)}</Link>
                {" · "}
                <span className="ui-hint">{say("web.legal.edition", { date: dateLong(r.revision_date) })}</span>
                {changed && <Notice>{say("web.legal.changed")}</Notice>}
              </ListItem>
            );
          })}
        </List>
      )}
      {pending.length > 0 ? (
        <>
          <p className="ui-hint">{say("web.legal.why")}</p>
          <LegalBoxes revisions={pending} checked={checked} onCheck={(d, on) => setChecked((c) => ({ ...c, [d]: on }))} />
          <Button type="button" kind="primary" icon="check" className="ui-wide" aria-label={say("web.legal.accept")} aria-busy={busy} disabled={!all || busy} onClick={() => void accept()} data-testid="legal-accept" />
        </>
      ) : manifest && <p data-testid="legal-all">{say("web.legal.accepted")}</p>}
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
    </Screen>
  );
}
