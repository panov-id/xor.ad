// w4_me-edit-name: the first name with its counter, the age, what a new name goes through, Save. The web's
// EditProfile (web screens/Me.tsx) through the same call (client.editProfile, one field a call, as the web
// sends them); the move into the 21+ band asks once more (me.band21). Testids: edit-name, edit-age, edit-save, error.
import { useState } from "react";
import type { Answer, Client } from "@sdk/client.ts";
import { graphemes } from "@sdk/limits.ts";
import { ageDigits, lettersLeft, NAME_MAX } from "@sdk/register.ts";
import { failedLine, label, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { check } from "../../shell/icons";
import { Field } from "../register-parts";
import { eye } from "./icons";
import { ErrorLine, refusedStatus, SubPage } from "./parts";

/** A refused edit in words (web api/me.ts profileRefusal, without the moderation's own reasons). */
export function profileLine(answer: Answer<unknown>): string {
  const code = (answer.body as { error?: { code?: string } } | null)?.error?.code;
  if (code === "name_frozen") return say("profile.nameFrozen");
  if (code === "age_step_down") return say("profile.ageDown");
  if (code === "rate_limited") return say("profile.patchDay", { n: String(Math.min(24, Math.max(1, Math.ceil((answer.retryAfter ?? 86400) / 3600)))) });
  return refusedStatus(answer.status);
}

export function EditName({ client, name: was, age: wasAge, onDone, onBack }: { client: Client; name: string; age: number; onDone: () => void; onBack: () => void }) {
  const [name, setName] = useState(was);
  const [age, setAge] = useState(String(wasAge));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const nameChanged = name.trim() !== "" && name.trim() !== was;
  const ageChanged = age !== "" && Number(age) !== wasAge;
  const crossesUp = ageChanged && wasAge <= 20 && Number(age) >= 21;
  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      for (const patch of [nameChanged ? { name: name.trim() } : null, ageChanged ? { age: Number(age) } : null]) {
        if (!patch) continue;
        const answer = await client.editProfile(patch);
        if (answer.status !== 200 && answer.status !== 202) { setRefused(profileLine(answer)); return; }
      }
      onDone();
    } catch (e) {
      setRefused(failedLine(e));
    } finally {
      setBusy(false);
    }
  }
  const press = () => {
    if (busy || (!nameChanged && !ageChanged)) return;
    if (crossesUp && !asking) return setAsking(true);
    setAsking(false);
    void send();
  };
  return (
    <SubPage name="edit-name" title={say("app.me.name_title")} onBack={onBack}
      foot={
        <button type="button" className="cta cta-primary" aria-disabled={busy || (!nameChanged && !ageChanged) ? true : undefined} aria-busy={busy || undefined} onClick={press} data-testid="edit-save">
          <Icon d={check} /><span>{asking ? say("me.band21") : label("me.save")}</span>
        </button>
      }>
      <Field text={say("app.reg.name")} value={name} onChange={(v) => setName(graphemes(v, NAME_MAX))} testid="edit-name"
        under={<p className="reg-counter" data-testid="edit-left">{say("app.reg.left", { n: lettersLeft(name), max: NAME_MAX })}</p>} />
      <Field text={say("app.reg.age")} kind="number" value={age} onChange={(v) => { setAge(ageDigits(v)); setAsking(false); }} testid="edit-age" />
      <p className="me-note"><Icon d={eye} /><span>{say("app.me.name_checked")}</span></p>
      <ErrorLine text={refused} />
    </SubPage>
  );
}
