// w4_restore (sosed Dusk, mobile): a clean device raised by the paper code (web screens/Restore.tsx, depth/core/recovery.ts
// raise): the bar "Paper code" with its back, "Come back with the paper code", sixteen cells (four rows of four) over one
// real input, "New PIN" in six cells, and "Open". The claim leaves a first-PIN grant; the new PIN takes it (client.firstPin),
// the node's share and the PIN seal the identity in the vault as a registration does, and the person lands on the feed.
// Reached from the splash ("I have a paper code") and from the PIN screen ("Paper code"); path /restore.
// Testids (the web's): restore-code, restore-pin, restore-go, restore-back, error.
//
// As the web's raiseAndKeep, the reload grace is armed after the raise through app/src/vault.ts's one keep.
import { type FormEvent, useEffect, useRef, useState } from "react";
import { brand } from "@brand";
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
import { failedLine, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { useMinWidth } from "../shell/useMinWidth";
import { CODE_GROUP } from "@sdk/register.ts";
import { afterDigits, pressed as padPressed, type PinStage } from "./pin-flow";
import { PinStep } from "./Register";
import { NameCard } from "./Splash";
import { CODE_LENGTH, refusalLine, spread, zeroAfter } from "./me/restore-logic";

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;

/**
 * The web's raiseAndKeep (web/src/vault.ts), grace and all: the code opens the long key the node kept wrapped,
 * a fresh session key and wrapping pair are born (their pkcs8 handed over once), the first PIN takes the grant the
 * claim left, and the record is sealed under the PIN and the node's share. A refusal of the code is an Outcome,
 * a failure after it throws.
 */
/** A paper code the node took: the keys it raised wait for the new PIN (`finish`), or are zeroed (`drop`, on «back»). */
type Raised = { finish: (pin: string) => Promise<Client>; drop: () => void };

async function raiseCode(code: string): Promise<Raised | { outcome: Outcome }> {
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
  const long = longExtractable as CryptoKey | null, session = sessionPkcs8 as Uint8Array | null, wrap = wrapPkcs8 as Uint8Array | null;
  const drop = () => { session?.fill(0); wrap?.fill(0); };
  if (!outcome.ok) { drop(); return { outcome }; }
  if (!long || !session || !wrap) { drop(); throw new Error("the core did not hand the keys over"); }
  // docs/newdesign4 §11: the code is checked first, the PIN comes on its own screen (the first-PIN grant lasts hours,
  // identity.ts FIRST_PIN_TTL_HOURS); from here the two pkcs8 copies are zeroed however it ends: a refused first PIN,
  // a lost share or «back» included
  return { drop, finish: (pin) => zeroAfter(() => [session, wrap], async () => {
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
      longPkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", long));
      const record: Record_ = {
        id: "me",
        identityId: client.identityId,
        sessionId: client.sessionId,
        longSpki: client.longSpki,
        deviceSalt,
        wrappedLongKey: client.wrappedLongKey!,
        sealedLong: await seal(storage, longPkcs8),
        sealedSession: await seal(storage, session),
        sessionSpki: await sessionSpkiOf(session),
        sealedWrap: await seal(storage, wrap),
        wrapSpki: client.wrapPublicSpki!,
        wrapCheck: await checkOf(await crypto.subtle.importKey("pkcs8", wrap as BufferSource, WRAP_ALGORITHM, false, ["deriveBits"])),
        unlockKey: unlock.privateKey,
        unlockSpki,
        savedAt: Date.now(),
      };
      await putRecord(record);
      // the record opens under what was just derived: a record that does not is no record
      (await unseal(storage, record.sealedLong)).fill(0);
      await armGrace(material.local, share);
      return client;
    } finally {
      longPkcs8?.fill(0);
      material.auth.fill(0);
      material.local.fill(0);
      share?.fill(0);
    }
  }) };
}

export function Restore({ onDone, onBack, onNew, onArrive }: { onDone: (client: Client) => void; onBack: () => void; onNew?: () => void; onArrive?: () => void }) {
  const [groups, setGroups] = useState(["", "", "", ""]);
  const code = groups.join("");
  const [stage, setStage] = useState<"code" | PinStage>("code");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [misses, setMisses] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusals, setRefusals] = useState(0);
  const raised = useRef<Raised | null>(null);
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  const wide = useMinWidth("--nd-bp-split");
  // keys raised and left behind are zeroed: «back» from the PIN, or the screen gone
  useEffect(() => () => raised.current?.drop(), []);

  async function check() {
    if (code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await raiseCode(code);
      if ("outcome" in result) {
        const line = refusalLine(result.outcome as Extract<Outcome, { ok: false }>);
        setError(say(line.key, line.values));
        setRefusals((n) => n + 1);
      } else {
        raised.current = result;
        setStage("pin");
      }
    } catch (e) {
      setError(failedLine(e));
      setRefusals((n) => n + 1);
    }
    setBusy(false);
  }
  async function finish(typed: string) {
    if (!raised.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = await raised.current.finish(typed);
      raised.current = null;
      onDone(client);
    } catch (e) {
      setError(failedLine(e));
      setBusy(false);
    }
  }
  // the sixth digit moves on, as on register 03/04 (pin-flow.ts afterDigits)
  useEffect(() => {
    if (stage === "code" || busy) return;
    const move = afterDigits({ stage, pin, again, mismatch, misses });
    if (move.stage === stage && !move.create && move.misses === misses) return;
    const t = setTimeout(() => {
      setStage(move.stage); setPin(move.pin); setAgain(move.again); setMismatch(move.mismatch); setMisses(move.misses ?? 0);
      if (move.create) void finish(move.pin);
    }, move.create ? 0 : 180);
    return () => clearTimeout(t);
  }, [stage, pin, again]);

  const type = (at: number, v: string) => {
    const next = spread(groups, at, v);
    setGroups(next);
    setError(null);
    const open = next.findIndex((g) => g.length < CODE_GROUP);
    if (next[at].length === CODE_GROUP && open > at) fields.current[open]?.focus();
  };
  const back = () => {
    if (stage === "code") return onBack();
    raised.current?.drop(); raised.current = null;
    setPin(""); setAgain(""); setMismatch(false); setMisses(0); setStage("code");
  };

  // docs/newdesign4 11 restore (SCREENS_spec §11): back, «Your paper code», four fields 2×2 with the group's number, the
  // hint, «No paper code?» with the two other ways, «Continue» quiet until sixteen; then the new PIN on the layout of 14
  return (
    <main className="k-screen nd-screen" data-screen={stage === "code" ? "restore" : "restore-pin"} data-stage={stage === "code" ? undefined : stage}>
      <div className="nd-col nd-split nd-reg-split">
        {wide && <NameCard />}
        <form className="nd-form nd-reg" onSubmit={(e: FormEvent) => { e.preventDefault(); void check(); }}>
          <header className="nd-head">
            <button type="button" className="nd-back" aria-label={say("app.reg.back")} onClick={back} data-testid="restore-back"><NdIcon name="back" /></button>
          </header>
          {stage === "code" ? <>
            <div className="nd-title">
              <h1 className="nd-h1">{say("app.restore.your_code")}</h1>
              <p className="nd-sub">{say("app.restore.type_1")}<br />{say("app.restore.type_2")}</p>
            </div>
            <div className="nd-groups nd-restore-code" data-testid="restore-code" data-shake={error ? "" : undefined}>
              {groups.map((g, i) => (
                <label key={i} className="nd-group" data-group={i + 1} data-on={g.length === CODE_GROUP ? "" : undefined}>
                  <input ref={(n) => { fields.current[i] = n; }} value={g} inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                    aria-label={say("app.restore.group", { n: i + 1 })} aria-invalid={error ? true : undefined} data-group={i + 1}
                    onChange={(e) => type(i, e.target.value)} onPaste={(e) => { e.preventDefault(); type(i, e.clipboardData.getData("text")); }}
                    onKeyDown={(e) => { if (e.key === "Backspace" && !g && i > 0) fields.current[i - 1]?.focus(); }} />
                </label>
              ))}
            </div>
            {error
              ? <p className="nd-pinline" data-tone="error" role="alert" data-testid="error">{error}</p>
              : <p className="nd-have">{say("app.restore.hint_1")}<br />{say("app.restore.hint_2")}</p>}
            {busy && <p className="nd-sub" role="status" data-testid="restore-busy">{say("web.unlock.asking")}</p>}
            <div className="nd-grow" />
            <p className="nd-have" data-testid="restore-other">{say("app.restore.none")}<br />
              {onNew && <button type="button" className="nd-link" onClick={onNew}>{say("app.restore.new")}</button>}
              {onNew && onArrive && " · "}
              {onArrive && <button type="button" className="nd-link" onClick={onArrive}>{say("app.reg.have_move")}</button>}
            </p>
            <button type="submit" className="nd-cta" data-quiet={code.length === CODE_LENGTH && !busy ? undefined : ""}
              aria-disabled={code.length === CODE_LENGTH && !busy ? undefined : true} aria-busy={busy || undefined} data-testid="restore-go">{say("web.offer.continue")}</button>
            {refusals > 0 && <span className="k-hide" data-testid="restore-refusals">{refusals}</span>}
          </> : (
            <PinStep stage={stage} pin={pin} again={again} mismatch={mismatch} busy={busy} onKey={(k) => stage === "pin" ? setPin(padPressed(pin, k)) : setAgain(padPressed(again, k))}
              setPin={setPin} setAgain={setAgain} retry={null}
              note={error && <p className="nd-pinline" data-tone="error" role="alert" data-testid="error">{error}</p>}
              make={{ title: say("app.restore.pin_title"), sub: say("app.restore.pin_sub"), icon: "lock", line: say("app.reg.pin_tile_1", { name: brand.name }), quiet: say("app.reg.pin_tile_2") }} />
          )}
        </form>
      </div>
    </main>
  );
}
