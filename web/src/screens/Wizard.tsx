// The onboarding wizard (owner goal Ц4; sheets panel/design/adaptive-*-wizard-1..4.svg): four steps at
// most, shown once after registration, skippable at any step, and replayable from «я». Each step is
// a picture and a few words: phrases nearby, the mark as «I'm in», tables and games, nothing leaves.
// The step dots and the close × stand on one axis; the examples and the button share one left edge
// (the column's); the words sit 24 under the picture. The main button is an icon: next, and on the
// last step «start». All words are keys of the dictionaries (web.wizard.*).

import { useState } from "react";
import { say } from "../api/me.ts";
import { Button } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Mark } from "../ui/Mark.tsx";
import { Screen } from "../ui/Screen.tsx";
import "./wizard.css";

const STEPS = 4;
const SEEN_KEY = "wizard-seen";

// Seen once per device, kept in the page's storage; storage that throws (a private window, blocked
// site data) reads as «not seen», and writing to it is skipped — the wizard is then shown again, which
// is harmless.
export function wizardSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
export function markWizardSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* nowhere to keep it */
  }
}

function Example({ tone, text, mode, icon, count }: { tone: "a" | "b"; text: string; mode: string; icon: "me" | "company"; count: number }) {
  return (
    <div data-part="example" data-tone={tone}>
      <p>{text}</p>
      <div data-part="meta">
        <span data-part="mode"><Icon name={icon} size={20} />{mode}</span>
        <span data-part="count"><Icon name="like" size={20} />{count}</span>
      </div>
    </div>
  );
}

function Art({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div data-part="art" data-art="phrases">
        <Example tone="a" text={say("web.wizard.s1.a")} mode={say("web.wizard.s1.alone")} icon="me" count={3} />
        <Example tone="b" text={say("web.wizard.s1.b")} mode={say("web.wizard.s1.friends")} icon="company" count={4} />
      </div>
    );
  }
  if (step === 1) {
    return (
      <div data-part="art" data-art="mark">
        <Icon name="like" size={72} />
        <span data-lit=""><Icon name="like" size={72} /></span>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div data-part="art" data-art="table">
        {Array.from({ length: 9 }, (_, i) => <span key={i} data-part="seat" />)}
      </div>
    );
  }
  return (
    <div data-part="art" data-art="private">
      <Mark size={160} place="splash" />
    </div>
  );
}

export function Wizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS - 1;
  const n = step + 1;
  const title = say(`web.wizard.s${n}.title`);
  return (
    <Screen name={`wizard-${n}`} title={title} data-testid={`wizard-${n}`}>
      <div data-part="top">
        <div data-part="dots" role="img" aria-label={say("web.wizard.step", { n, m: STEPS })}>
          {Array.from({ length: STEPS }, (_, i) => <span key={i} data-part="dot" data-on={i === step ? "now" : i < step ? "done" : undefined} />)}
        </div>
        <Button type="button" icon="close" aria-label={say("web.wizard.skip")} onClick={onDone} data-testid="wizard-skip" />
      </div>
      <div data-part="body">
        <Art step={step} />
        <div data-part="words">
          <h1>{title}</h1>
          {n > 1 && <p>{say(`web.wizard.s${n}.text`)}</p>}
        </div>
      </div>
      <Button
        type="button"
        kind="primary"
        icon={last ? "check" : "open"}
        className="ui-wide"
        aria-label={last ? say("web.wizard.start") : say("web.wizard.next")}
        onClick={last ? onDone : () => setStep(step + 1)}
        data-testid={last ? "wizard-start" : "wizard-next"}
      />
    </Screen>
  );
}
