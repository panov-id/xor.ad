// w4_cabinet-sign-in and w4_cabinet-sent: the way into the cabinet is only the link from the letter. The email, a
// contact for a new account (the web's cabinet, web/src/adv/Cabinet.tsx SignIn: a contact makes it signUp, none is
// signIn; the answer is the same either way), Get the link; then "Check your mail". The link that expired has no
// sheet yet: it is the sent screen's frame with the way to ask again.
import { useState } from "react";
import { signIn, signUp } from "@sdk/cabinet.ts";
import { say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { Field } from "../register-parts";
import { link } from "../me/icons";
import { ErrorLine } from "../me/parts";
import { mail } from "./icons";
import { Frame } from "./parts";
import type { ReactNode } from "react";

export function SignIn({ strip, onSent }: { strip: ReactNode; onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const ready = email.includes("@") && !busy;
  async function go() {
    if (!ready) return;
    setBusy(true);
    setRefused(null);
    try {
      const answer = contact.trim() ? await signUp(email.trim(), contact.trim()) : await signIn(email.trim());
      if (answer.status === 204) return onSent();
      if (answer.status === 429) return setRefused(say("web.cabinet.tooMany", { n: answer.retryAfter ?? "?" }));
      setRefused(say("web.cabinet.notTaken", { status: answer.status }));
    } catch {
      setRefused(say("web.cabinet.notTaken", { status: 0 }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame name="cabinet-sign-in" title={say("app.cabinet.sign_title")} strip={strip}
      foot={
        <button type="button" className="cta cta-primary" aria-disabled={ready ? undefined : true} aria-busy={busy || undefined} onClick={() => void go()} data-testid="adv-send">
          <Icon d={link} /><span>{say("app.cabinet.get_link")}</span>
        </button>
      }>
      <p className="cb-sub">{say("app.cabinet.sign_sub")}</p>
      <Field kind="email" text={say("app.cabinet.email")} value={email} onChange={setEmail} testid="adv-email" />
      <Field text={say("app.cabinet.contact")} value={contact} onChange={setContact} testid="adv-contact" autoComplete="off" placeholder={say("app.cabinet.contact_hint")} />
      <ErrorLine text={refused} />
    </Frame>
  );
}

export function Sent({ strip }: { strip: ReactNode }) {
  return (
    <Frame name="cabinet-sent" title={say("app.cabinet.sent_title")} strip={strip}>
      <div className="cb-circle" aria-hidden="true"><Icon d={mail} /></div>
      <p className="cb-sub cb-sent" data-testid="adv-sent">{say("app.cabinet.sent_note")}</p>
    </Frame>
  );
}

export function Expired({ strip, onAgain }: { strip: ReactNode; onAgain: () => void }) {
  return (
    <Frame name="cabinet-expired" title={say("app.cabinet.expired_title")} strip={strip}
      foot={<button type="button" className="cta cta-primary" onClick={onAgain} data-testid="adv-again"><Icon d={link} /><span>{say("app.cabinet.ask_again")}</span></button>}>
      <p className="cb-sub" data-testid="adv-expired">{say("app.cabinet.expired_note")}</p>
    </Frame>
  );
}
