// docs/newdesign4 screens 06 unlock, 07 unlock-error, 09 locked (SCREENS_spec §7, 8, 10): one door for the PIN. On a
// phone the name card of 01 holds the line («Enter your PIN», the refusal, «Locked after 15 min away») and the six dots,
// the pad stands under the card; from 768 the card stands aside and the form panel has «Welcome back», the line, the
// dots, the pad and «You can also type on the keyboard». A refusal rings the dots in the accent and shakes them for a
// second. The pad's left key is the paper code (aria-label «Paper code»), when the screen has a way to it.
import { type ReactNode, useEffect, useState } from "react";
import { PIN_LENGTH, pinDigits } from "@sdk/register.ts";
import { say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { useMinWidth } from "../shell/useMinWidth";
import { Cells, PinPad } from "./register-parts";
import { pressed as padPressed } from "./pin-flow";
import { NameCard } from "./Splash";

export function PinDoor({ screen, line, tone, pin, setPin, inputRef, field, testid, disabled, onPaper, refusals, more, under }: {
  screen: string; line: string; tone?: "error" | "quiet"; pin: string; setPin: (v: string) => void; inputRef: (n: HTMLInputElement | null) => void;
  field: string; testid: string; disabled: boolean; onPaper?: () => void; refusals: number; more?: ReactNode; under?: ReactNode;
}) {
  const wide = useMinWidth("--nd-bp-split");
  // SCREENS_spec §8: the dots ring in the accent and shake, a second later they are plain empty rings again
  const [ring, setRing] = useState(false);
  useEffect(() => {
    if (!refusals) return;
    setRing(true);
    try { navigator.vibrate?.(30); } catch { /* no vibration */ }
    const t = setTimeout(() => setRing(false), 1000);
    return () => clearTimeout(t);
  }, [refusals]);
  const words = (
    <p className="nd-pinline" data-tone={tone} role={tone === "error" ? "alert" : undefined} data-testid={tone === "error" ? "error" : undefined}>
      {tone === "quiet" && <NdIcon name="clock" />}<span>{line}</span>
    </p>
  );
  const dots = (
    <div className="nd-pin" data-stage="unlock" data-shake={ring ? "" : undefined} data-ring={ring ? "" : undefined}>
      <Cells id={field} text={say("web.ui.pinName")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(pinDigits(v))}
        onPaste={(e) => { e.preventDefault(); setPin(pinDigits(e.clipboardData.getData("text"))); }} inputRef={inputRef} testid={testid} />
    </div>
  );
  const pad = <PinPad onKey={(k) => setPin(padPressed(pin, k))} disabled={disabled} paper={onPaper} />;
  return (
    <main className="k-screen nd-screen" data-screen={screen}>
      <div className="nd-col nd-split nd-door">
        {wide ? <NameCard /> : <NameCard line={words}>{dots}{under}</NameCard>}
        {more}
        <div className="nd-form nd-reg">
          {wide && <div className="nd-title"><h1 className="nd-h1">{say("app.unlock.title")}</h1>{words}</div>}
          {wide && dots}
          {wide && under}
          <div className="nd-grow" />
          {pad}
          {wide && <p className="nd-have">{say("app.unlock.keyboard")}</p>}
        </div>
      </div>
    </main>
  );
}
