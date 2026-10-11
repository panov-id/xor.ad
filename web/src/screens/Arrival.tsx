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
import { FormCard, PinPair } from "../ui/FormCard.tsx";
import { CellField } from "../ui/CellField.tsx";
import { PinField } from "../ui/Field.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";
import { Split } from "../ui/Split.tsx";
import { Screen } from "../ui/Screen.tsx";
import type { ReactNode } from "react";

// hero: the brand view's picture (brands/<brand>), drawn over the same state.
// `brandClass` is still passed by the brand views and no longer used: the
// brand's rules reach this screen by its data-screen (brands/*/*.css), so the
// screen carries no class of its own (К4).
export function Arrival({ onDone, onBack, hero }: { onDone: (client: Client, longKey: CryptoKey) => void; onBack: () => void; brandClass?: string; hero?: ReactNode }) {
  const { code, setCode, pin, setPin, again, setAgain, busy, error, into, state, clean, claim, keep } = useArrival({ onDone });
  const ending = ENDINGS[state];
  const title = say(state === "approved" ? "move.arrivedTitle" : "move.inTitle");
  return (
    <Screen name="arrival" title={title} header={!into || ending ? <HeaderScreen title={title} onBack={onBack} backLabel={say("common.back")} backTestid="arrive-back" /> : <HeaderScreen title={title} />}>
      {!into && hero}
      {!into
        ? (
          <>
            <FormCard icon="arrive" error={error} info={<Info label={say("web.info.move")} data-testid="arrive-info"><p>{say("move.inIntro")}</p></Info>}>
            <CellField label={say("move.code")} cells={9} groups={[3, 3, 3]} value={code} onChange={(v) => setCode(v.slice(0, 13))} autoComplete="off" data-testid="arrive-code" />
            {busy && <p role="status">{say("move.deriving")}</p>}
            </FormCard>
            <Button kind="primary" type="button" icon="open" className="ui-wide" aria-label={say("reg.next")} disabled={clean.length !== 9 || busy} onClick={() => void claim()} data-testid="arrive-go" />
          </>
        )
        : ending
        ? (
          <FormCard icon="arrive" error={error}>
            <p data-testid="move-ending">{say(ending)}</p>
          </FormCard>
        )
        : state === "approved"
        ? (
          <>
            <FormCard icon="key" error={error}>
            <p>{say("move.arrived")}</p>
            <PinPair>
            <PinField label={say("web.pin.new")} value={pin} onChange={setPin} data-testid="arrive-pin" />
            <PinField label={say("web.pin.newAgain")} value={again} onChange={setAgain}
              error={pin.length === 6 && again.length === 6 && pin !== again ? say("reg.pinMismatch") : undefined} data-testid="arrive-pin-again" />
            </PinPair>
            </FormCard>
            <Split><Button kind="primary" type="button" icon="check" aria-label={say("reg.next")} disabled={!/^\d{6}$/.test(pin) || pin !== again || busy} onClick={() => void keep()} data-testid="arrive-keep" /></Split>
          </>
        )
        : (
          <FormCard icon="arrive" error={error}>
            <dl>
              <dt>{say("move.check")}</dt><dd data-testid="arrive-check">{into.arrival.check}</dd>
            </dl>
            <p>{say("move.inWait")}</p>
          </FormCard>
        )}
    </Screen>
  );
}
