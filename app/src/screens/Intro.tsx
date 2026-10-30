// «How it works» (the prototype's wizard-1…5, docs/newdesign/proto): once, after a fresh registration, four cards and
// then the place as the fifth step under the same bar (wizard-5: me/Place.tsx in its wizard mode).
// Testids: intro, intro-step (data-step 1…4), intro-next, intro-close, intro-place.
import { useState } from "react";
import type { Place as PlaceT } from "@sdk/place.ts";
import { say } from "../i18n";
import { EntryScene } from "../shell/EntryScene";
import { NdIcon } from "../shell/NdIcon";
import { Scene } from "../shell/Scene";
import { Place } from "./me/Place";

export const INTRO_CARDS = [
  { icon: "phrase", key: "say" },
  { icon: "imin", key: "both" },
  { icon: "tables", key: "tables" },
  { icon: "shield", key: "safe" },
] as const;

export function Intro({ onDone, onPlaced, onQr }: { onDone: () => void; onPlaced: (p: PlaceT) => void; onQr: () => void }) {
  const [n, setN] = useState(0);
  const card = INTRO_CARDS[n];
  const last = n === INTRO_CARDS.length - 1;
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
  // the prototype's wizard-1…4: the bar with the title, five dots (the fifth is the place) and the cross; the yard with the
  // card's icon in a round panel over it; the title and the text; «next»
  return (
    <main className="k-screen" data-screen="intro">
      <EntryScene title={say(`app.intro.${card.key}_title`)} text={say(`app.intro.${card.key}_text`)} icon={card.icon} />
      <div className="k-col">
        {bar}
        <section className="k-panel k-grow k-splash k-intro" data-testid="intro-step" data-step={n + 1} key={card.key}>
          <Scene kind="splash"><span className="k-intro-mark" aria-hidden="true"><NdIcon name={card.icon} /></span></Scene>
          <div className="k-stack">
            <h2 className="k-title k-title-big">{say(`app.intro.${card.key}_title`)}</h2>
            <p className="k-sub k-price">{say(`app.intro.${card.key}_text`)}</p>
          </div>
        </section>
        <section className="k-panel k-actions">
          <button type="button" className="k-cta" onClick={() => setN(n + 1)} data-testid="intro-next">
            <NdIcon name={last ? "place" : "chev"} /><span>{say(last ? "app.intro.to_place" : "app.intro.next")}</span>
          </button>
        </section>
      </div>
    </main>
  );
}
