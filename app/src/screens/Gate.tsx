// w4_restore (sosed Dusk, mobile): a clean device raised by the paper code (web screens/Restore.tsx, depth/core/recovery.ts
// raise): the bar "Paper code" with its back, "Come back with the paper code", sixteen cells (four rows of four) over one
// real input, "New PIN" in six cells, and "Open". The claim leaves a first-PIN grant; the new PIN takes it (client.firstPin),
// the node's share and the PIN seal the identity in the vault as a registration does, and the person lands on the feed.
// Reached from the splash ("I have a paper code") and from the PIN screen ("Paper code"); path /restore.
// Testids (the web's): restore-code, restore-pin, restore-go, restore-back, error.
//
// As the web's raiseAndKeep, the reload grace is armed after the raise through app/src/vault.ts's one keep.
import { useId, useRef, useState } from "react";
import { type Answer, Client, WRAP_ALGORITHM } from "@sdk/client.ts";
import { checkOf, type Record_ } from "@sdk/enroll.ts";
import { open as unseal, seal, vaultKey } from "@sdk/lock.ts";
import { derivePin } from "@sdk/pin.ts";
import { raise as raiseByCode, type Outcome } from "@sdk/recovery.ts";
import { fromBase64url } from "@sdk/seal.ts";
import { base64url } from "@sdk/sign.ts";
import { HeldKey } from "@sdk/transfer.ts";
import { sessionSpkiOf } from "@platform/arrive_keep.ts";
import { armGrace, putRecord } from "../vault";
import { API_KEY, NODE_BASE } from "../config";
import { failedLine, label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { key } from "../shell/icons";
import { Cells } from "./register-parts";
import { CODE_LENGTH, codeChars, newPinDigits, PIN_LENGTH, refusalLine, restoreReady, zeroAfter } from "./me/restore-logic";
import { ErrorLine, SubPage } from "./me/parts";

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

/**
 * The web's raiseAndKeep (web/src/vault.ts), grace and all: the code opens the long key the node kept wrapped,
 * a fresh session key and wrapping pair are born (their pkcs8 handed over once), the first PIN takes the grant the
 * claim left, and the record is sealed under the PIN and the node's share. A refusal of the code is an Outcome,
 * a failure after it throws.
 */
async function raiseAndKeep(code: string, pin: string): Promise<{ client: Client } | { outcome: Outcome }> {
  const client = new Client(NODE_BASE, API_KEY);
  const unlock = await crypto.subtle.generateKey(P256, false, ["sign", "verify"]) as CryptoKeyPair;
  const unlockSpki = base64url(new Uint8Array(await crypto.subtle.exportKey("spki", unlock.publicKey)));
  let longExtractable: CryptoKey | null = null;
  let sessionPkcs8: Uint8Array | null = null;
  let wrapPkcs8: Uint8Array | null = null;
  const outcome = await raiseByCode(client, code, {
    hold: async (k) => { longExtractable = k; return await HeldKey.hold(k); },
    holdSession: async (pkcs8) => { sessionPkcs8 = pkcs8.slice(); },
    holdWrap: async (pkcs8) => { wrapPkcs8 = pkcs8.slice(); },
    unlockPub: unlockSpki,
  });
  // from here the two pkcs8 copies are zeroed however it ends: a refused first PIN or a lost share included
  return zeroAfter(() => [sessionPkcs8, wrapPkcs8], async () => {
    if (!outcome.ok) return { outcome };
    if (!longExtractable || !sessionPkcs8 || !wrapPkcs8) throw new Error("the core did not hand the keys over");
    const set: Answer = await client.firstPin(pin);
    if (set.status !== 200 && set.status !== 204) throw new Error(`the first PIN was refused: ${set.status} ${JSON.stringify(set.body)}`);
    const deviceSalt = client.deviceSalt!;
    const material = await derivePin(pin, deviceSalt);
    let share: Uint8Array | null = null;
    let longPkcs8: Uint8Array | null = null;
    try {
      const given = await client.request<{ share: string }>("POST", "/vault/share", { auth: base64url(material.auth) });
      if (given.status !== 200) throw new Error(`the node did not hand back its share: ${given.status}`);
      share = fromBase64url(given.body.share);
      const storage = await vaultKey(material.local, share);
      longPkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", longExtractable));
      const record: Record_ = {
        id: "me",
        identityId: client.identityId,
        sessionId: client.sessionId,
        longSpki: client.longSpki,
        deviceSalt,
        wrappedLongKey: client.wrappedLongKey!,
        sealedLong: await seal(storage, longPkcs8),
        sealedSession: await seal(storage, sessionPkcs8),
        sessionSpki: await sessionSpkiOf(sessionPkcs8),
        sealedWrap: await seal(storage, wrapPkcs8),
        wrapSpki: client.wrapPublicSpki!,
        wrapCheck: await checkOf(await crypto.subtle.importKey("pkcs8", wrapPkcs8 as BufferSource, WRAP_ALGORITHM, false, ["deriveBits"])),
        unlockKey: unlock.privateKey,
        unlockSpki,
        savedAt: Date.now(),
      };
      await putRecord(record);
      // the record opens under what was just derived: a record that does not is no record
      (await unseal(storage, record.sealedLong)).fill(0);
      await armGrace(material.local, share);
      return { client };
    } finally {
      longPkcs8?.fill(0);
      material.auth.fill(0);
      material.local.fill(0);
      share?.fill(0);
    }
  });
}

export function Restore({ onDone, onBack }: { onDone: (client: Client) => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinInput = useRef<HTMLInputElement | null>(null);
  const codeField = useId(), pinField = useId();

  async function go() {
    if (!restoreReady(code, pin, busy)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await raiseAndKeep(code, pin);
      if (!("client" in result)) {
        const line = refusalLine(result.outcome as Extract<Outcome, { ok: false }>);
        setError(say(line.key, line.values));
        return setBusy(false);
      }
      onDone(result.client);
    } catch (e) {
      setError(failedLine(e));
      setBusy(false);
    }
  }
  // sixteen characters in: the next character is the PIN's
  const typeCode = (v: string) => { const next = codeChars(v); setCode(next); if (next.length === CODE_LENGTH) pinInput.current?.focus(); };
  return (
    <SubPage name="restore" title={label("restore.title")} onBack={onBack}
      foot={
        <button type="button" className="cta cta-primary" aria-disabled={restoreReady(code, pin, busy) ? undefined : true} aria-busy={busy || undefined} onClick={() => void go()} data-testid="restore-go">
          <Icon d={key} /><span>{say("app.restore.open")}</span>
        </button>
      }>
      <h2 className="k-title k-title-big">{say("app.restore.title")}</h2>
      <p className="k-sub">{say("app.restore.sub")}</p>
      <div className="reg-field restore-code">
        <Cells id={codeField} text={say("restore.code")} value={code} size={CODE_LENGTH} onChange={typeCode}
          onPaste={(e) => { e.preventDefault(); typeCode(e.clipboardData.getData("text")); }} testid="restore-code" />
      </div>
      <div className="reg-field">
        <label htmlFor={pinField}>{label("web.pin.new")}</label>
        <Cells id={pinField} text={say("web.ui.pinName")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(newPinDigits(v))}
          onPaste={(e) => { e.preventDefault(); setPin(newPinDigits(e.clipboardData.getData("text"))); }}
          onKeyDown={(e) => { if (e.key === "Enter") void go(); }} inputRef={(n) => { pinInput.current = n; }} testid="restore-pin" />
      </div>
      <ErrorLine text={error} />
    </SubPage>
  );
}
