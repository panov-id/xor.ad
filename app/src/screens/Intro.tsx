// «How it works» (the prototype's wizard-1…5, docs/newdesign/proto): once, after a fresh registration, four cards and
// then the place as the fifth step under the same bar (wizard-5: me/Place.tsx in its wizard mode).
// Testids: intro, intro-step (data-step 1…4), intro-next, intro-close, intro-place.
import { useState } from "react";
import type { Place as PlaceT } from "@sdk/place.ts";
import { say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { Place } from "./me/Place";
import { useDrawing } from "../nd4/drawing";
import { words } from "../nd4/texts";
import { Wizard1Screen } from "../nd4/screens/wizard-1.gen";
import { Wizard1ScreenLaptop } from "../nd4/screens/wizard-1-laptop.gen";
import { Wizard1ScreenTablet } from "../nd4/screens/wizard-1-tablet.gen";
import { Wizard2Screen } from "../nd4/screens/wizard-2.gen";
import { Wizard2ScreenLaptop } from "../nd4/screens/wizard-2-laptop.gen";
import { Wizard2ScreenTablet } from "../nd4/screens/wizard-2-tablet.gen";
import { Wizard3Screen } from "../nd4/screens/wizard-3.gen";
import { Wizard3ScreenLaptop } from "../nd4/screens/wizard-3-laptop.gen";
import { Wizard3ScreenTablet } from "../nd4/screens/wizard-3-tablet.gen";
import { Wizard4Screen } from "../nd4/screens/wizard-4.gen";
import { Wizard4ScreenLaptop } from "../nd4/screens/wizard-4-laptop.gen";
import { Wizard4ScreenTablet } from "../nd4/screens/wizard-4-tablet.gen";

const SCREENS = [
  [Wizard1Screen, Wizard1ScreenTablet, Wizard1ScreenLaptop],
  [Wizard2Screen, Wizard2ScreenTablet, Wizard2ScreenLaptop],
  [Wizard3Screen, Wizard3ScreenTablet, Wizard3ScreenLaptop],
  [Wizard4Screen, Wizard4ScreenTablet, Wizard4ScreenLaptop],
] as const;

export const INTRO_CARDS = [
  { icon: "phrase", key: "say" },
  { icon: "imin", key: "both" },
  { icon: "tables", key: "tables" },
  { icon: "shield", key: "safe" },
] as const;

export function Intro({ onDone, onPlaced, onQr }: { onDone: () => void; onPlaced: (p: PlaceT) => void; onQr: () => void }) {
  const [n, setN] = useState(0);
  const wide = useDrawing();
  const card = INTRO_CARDS[n];
  const bar = (
    <header className="k-row k-bar">
      <div className="k-bar-title">
        <h1 className="k-bar-word">{say("app.intro.title")}</h1>
        <ol className="k-steps" aria-label={say("app.intro.steps", { n: n + 1, of: INTRO_CARDS.length + 1 })}>
          {[...INTRO_CARDS, null].map((c, i) => <li key={c?.key ?? "place"} data-done={i <= n ? "yes" : undefined} />)}
        </ol>
      </div>
      <button type="button" className="k-bar-btn" aria-label={say("app.intro.skip")} onClick={onDone} data-testid="intro-close"><NdIcon name="close" /></button>
    </header>
  );
  // wizard-5: the place under the same bar, every dash lit
  if (n === INTRO_CARDS.length) return <Place wizard={bar} onChosen={onPlaced} onBack={onDone} onQr={onQr} />;
  // docs/newdesign4 screens 17…20 (wizard-1…4): the archive's markup as is, its words through nd4/texts
  const Screen = SCREENS[n][wide === "laptop" ? 2 : wide === "tablet" ? 1 : 0];
  return (
    <main className="k-screen nd-screen" data-screen="intro" data-width={wide} data-bare="">
      <div data-testid="intro-step" data-step={n + 1} key={card.key} style={{ display: "contents" }}>
        <Screen t={words(`wizard-${n + 1}` as "wizard-1")} backLabel={say("app.reg.back")} onSkip={onDone} onNext={() => setN(n + 1)} onBack={() => setN(Math.max(0, n - 1))} />
      </div>
    </main>
  );
}
