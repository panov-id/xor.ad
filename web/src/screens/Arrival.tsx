// The device the identity arrives at (T1; chat spec §8.2, screen 13; depth/ink
// move.ts MoveIn): nine characters from the old device, the four check
// characters to compare there, and after "it is me" a first PIN, which seals
// the identity on this device as a raise by the paper code does. Words
// verbatim from depth/ink/locales/ru.json.

import { useArrival } from "./logic/useArrival.ts";
import type { Client } from "../../../depth/core/client.ts";
import { say } from "../api/me.ts";
import { ENDINGS } from "../api/transfer.ts";
import { Button } from "../ui/Button.tsx";
import "./talk.css";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";
import type { ReactNode } from "react";

// brandClass and hero: the brand view's look (brands/<brand>), drawn over the same state.
export function Arrival({ onDone, onBack, brandClass, hero }: { onDone: (client: Client, longKey: CryptoKey) => void; onBack: () => void; brandClass?: string; hero?: ReactNode }) {
  const { code, setCode, pin, setPin, again, setAgain, busy, error, into, state, clean, claim, keep } = useArrival({ onDone });
  const ending = ENDINGS[state];
  return (
    <main className={["screen arrival", brandClass].filter(Boolean).join(" ")} data-screen="arrival" data-state={into ? state : "start"}>
      <HeaderScreen title={say(state === "approved" ? "move.arrivedTitle" : "move.inTitle")} />
      {!into && hero}
      {!into
        ? (
          <>
            <div className="ui-info-row"><Info label={say("move.inTitle")} data-testid="arrive-info"><p>{say("move.inIntro")}</p></Info></div>
            <label>
              {say("move.code")}
              <input value={code} onChange={(e) => setCode(e.target.value.slice(0, 13))} data-testid="arrive-code" autoComplete="off" />
            </label>
            {busy && <p className="muted">{say("move.deriving")}</p>}
            <Button kind="primary" type="button" icon="open" className="ui-wide" aria-label={say("reg.next")} disabled={clean.length !== 9 || busy} onClick={() => void claim()} data-testid="arrive-go" />
            <Button kind="secondary" type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="arrive-back" />
          </>
        )
        : ending
        ? (
          <>
            <p data-testid="move-ending">{say(ending)}</p>
            <Button kind="secondary" type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="arrive-back" />
          </>
        )
        : state === "approved"
        ? (
          <>
            <p className="muted">{say("move.arrived")}</p>
            <label>
              {say("pin.next")}
              <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="arrive-pin" />
            </label>
            <label>
              {say("pin.again")}
              <input type="password" inputMode="numeric" value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="arrive-pin-again" />
            </label>
            {pin.length === 6 && again.length === 6 && pin !== again && <p className="error">{say("reg.pinMismatch")}</p>}
            <Button kind="primary" type="button" icon="check" className="ui-wide" aria-label={say("reg.next")} disabled={!/^\d{6}$/.test(pin) || pin !== again || busy} onClick={() => void keep()} data-testid="arrive-keep" />
          </>
        )
        : (
          <>
            <dl>
              <dt>{say("move.check")}</dt><dd data-testid="arrive-check">{into.arrival.check}</dd>
            </dl>
            <p className="muted">{say("move.inWait")}</p>
          </>
        )}
      {error && <p className="error" data-testid="error">{error}</p>}
    </main>
  );
}
