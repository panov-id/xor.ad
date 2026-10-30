// desktop_1440 6-me edit-age.svg: the age on its own (the profile hub's age tile): the clock mark, the stepper as in
// register-1, what the change does (me.ageHint), Save. The same call as EditName (client.editProfile { age }); the move
// into the 21+ band asks once more (me.band21). Testids: edit-age, edit-age-less, edit-age-more, edit-save, error.
import { useState } from "react";
import type { Client } from "@sdk/client.ts";
import { ageDigits } from "@sdk/register.ts";
import { failedLine, label, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { check } from "../../shell/icons";
import { NdIcon } from "../../shell/NdIcon";
import { Field } from "../register-parts";
import { profileLine } from "./EditName";
import { ErrorLine, SubPage } from "./parts";

export function EditAge({ client, age: was, onDone, onBack }: { client: Client; age: number; onDone: () => void; onBack: () => void }) {
  const [age, setAge] = useState(String(was));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const changed = age !== "" && Number(age) !== was;
  const crossesUp = changed && was <= 20 && Number(age) >= 21;
  const step = (by: number) => { setAge(ageDigits(String(Math.max(0, (Number(age) || was) + by)))); setAsking(false); };
  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      const answer = await client.editProfile({ age: Number(age) });
      if (answer.status !== 200 && answer.status !== 202) return setRefused(profileLine(answer));
      onDone();
    } catch (e) {
      setRefused(failedLine(e));
    } finally {
      setBusy(false);
    }
  }
  const press = () => {
    if (busy || !changed) return;
    if (crossesUp && !asking) return setAsking(true);
    setAsking(false);
    void send();
  };
  return (
    <SubPage name="edit-age" title={say("app.reg.age")} onBack={onBack}
      foot={
        <button type="button" className="cta cta-primary" aria-disabled={busy || !changed ? true : undefined} aria-busy={busy || undefined} onClick={press} data-testid="edit-save">
          <Icon d={check} /><span>{asking ? say("me.band21") : label("me.save")}</span>
        </button>
      }>
      <div className="k-ava-hero" aria-hidden="true"><NdIcon name="clock" /></div>
      <div className="k-stepper">
        <button type="button" aria-label={say("app.reg.age_less")} onClick={() => step(-1)} data-testid="edit-age-less"><NdIcon name="back" /></button>
        <Field text={say("app.reg.age")} kind="number" value={age} onChange={(v) => { setAge(ageDigits(v)); setAsking(false); }} testid="edit-age" />
        <button type="button" aria-label={say("app.reg.age_more")} onClick={() => step(1)} data-testid="edit-age-more"><NdIcon name="chev" /></button>
      </div>
      <p className="k-note" role="status"><NdIcon name="alert" /><span>{say("me.ageHint")}</span></p>
      <ErrorLine text={refused} />
    </SubPage>
  );
}
