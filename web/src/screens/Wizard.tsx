// The onboarding wizard (owner goal Ц4; sheets panel/design/adaptive-*-wizard-1..4.svg): four steps at
// most, shown once after registration, skippable at any step, and replayable from «я». Each step is
// a picture and a few words: phrases nearby, the mark as «I'm in», tables and games, nothing leaves —
// and a fifth, where the person says where they are (GOALS §0: no silent Rome). The place is found by a
// city's name or a point pasted from a map (geo/place.ts); the browser is never asked for its position.
// The step dots and the close × stand on one axis; the examples and the button share one left edge
// (the column's); the words sit 24 under the picture. The main button is an icon: next, and on the
// last step «start». All words are keys of the dictionaries (web.wizard.*).

import { useEffect, useState } from "react";
import { say } from "../api/me.ts";
import { nameOf, parsePoint, type Place as PlaceT, searchCities, storedPlace, storePlace } from "../geo/place.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { Field } from "../ui/Field.tsx";
import { Split } from "../ui/Split.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Mark } from "../ui/Mark.tsx";
import { Screen } from "../ui/Screen.tsx";
import "./wizard.css";

const STEPS = 5;
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

// The place step: a city by its name or a point from a map; chosen, it is kept on this device at once
// and handed up. No geolocation here (privacy policy). Nothing chosen stays nothing — no Rome.
function PlaceStep({ onPlace }: { onPlace?: (p: PlaceT) => void }) {
  const [chosen, setChosen] = useState<PlaceT | null>(() => storedPlace());
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PlaceT[]>([]);
  const [point, setPoint] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void searchCities(q).then((list) => { if (live) setFound(list); });
    return () => { live = false; };
  }, [q]);
  const choose = (p: PlaceT) => { storePlace(p); setChosen(p); setError(null); setQ(""); onPlace?.(p); };
  async function fromPoint() {
    setError(null);
    const at = parsePoint(point);
    if (!at) return setError(say("web.place.badPoint"));
    const n = await nameOf(at.lat, at.lon);
    choose({ ...at, name: n.name, cc: n.cc, source: "point" });
  }
  return (
    <div data-part="place">
      <p className="ui-hint" data-testid="place-now">{chosen ? say("web.place.open", { name: chosen.name }) : say("web.place.none")}</p>
      <Field label={say("web.place.search")} value={q} onChange={setQ} autoComplete="off" data-testid="place-search" />
      {found.length > 0 && (
        <ul className="ui-cards" data-testid="place-found">
          {found.map((p) => (
            <li key={`${p.name}-${p.cc}-${p.lat}`}>
              <Button type="button" aria-label={`${p.name}, ${p.cc}`} onClick={() => choose(p)} data-testid="place-city">{p.name} · {p.cc}</Button>
            </li>
          ))}
        </ul>
      )}
      <Field label={say("web.place.point")} value={point} onChange={setPoint} autoComplete="off" data-testid="place-point" />
      <Split><Button type="button" icon="check" aria-label={say("web.place.use")} onClick={() => void fromPoint()} data-testid="place-use" /></Split>
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
    </div>
  );
}

// `onPlace` hands a chosen place to whoever holds the feed's place (App.tsx) so the feed reads around it.
export function Wizard({ onDone, onPlace }: { onDone: () => void; onPlace?: (p: PlaceT) => void }) {
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
        {step < 4 && <Art step={step} />}
        <div data-part="words">
          <h1>{title}</h1>
          {n > 1 && <p>{say(`web.wizard.s${n}.text`)}</p>}
        </div>
        {step === 4 && <PlaceStep onPlace={onPlace} />}
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
