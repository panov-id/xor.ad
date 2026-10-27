// «How it works» (the prototype's wizard-1…4, docs/newdesign/proto): once, after a fresh registration, four cards before
// the place (wizard-5 is the place screen itself).
// Testids: intro, intro-step (data-step 1…4), intro-next, intro-close.
import { useState } from "react";
import { say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { Scene } from "../shell/Scene";

export const INTRO_CARDS = [
  { icon: "phrase", key: "say" },
  { icon: "imin", key: "both" },
  { icon: "tables", key: "tables" },
  { icon: "shield", key: "safe" },
] as const;

export function Intro({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0);
  const card = INTRO_CARDS[n];
  const last = n === INTRO_CARDS.length - 1;
  // the prototype's wizard-1…4: the bar with the title, five dots (the fifth is the place) and the cross; the yard with the
  // card's icon in a round panel over it; the title and the text; «next»
  return (
    <main className="k-screen" data-screen="intro">
      <div className="k-col">
        <header className="k-row k-bar">
          <div className="k-bar-title">
            <h1 className="k-bar-word">{say("app.intro.title")}</h1>
            <ol className="k-steps" aria-label={say("app.intro.steps", { n: n + 1, of: INTRO_CARDS.length })}>
              {[...INTRO_CARDS, null].map((c, i) => <li key={c?.key ?? "place"} data-done={i <= n ? "yes" : undefined} />)}
            </ol>
          </div>
          <button type="button" className="k-bar-btn" aria-label={say("app.intro.skip")} onClick={onDone} data-testid="intro-close"><NdIcon name="close" /></button>
        </header>
        <section className="k-panel k-grow k-splash k-intro" data-testid="intro-step" data-step={n + 1} key={card.key}>
          <Scene kind="splash"><span className="k-intro-mark" aria-hidden="true"><NdIcon name={card.icon} /></span></Scene>
          <div className="k-stack">
            <h2 className="k-title k-title-big">{say(`app.intro.${card.key}_title`)}</h2>
            <p className="k-sub k-price">{say(`app.intro.${card.key}_text`)}</p>
          </div>
        </section>
        <section className="k-panel k-actions">
          <button type="button" className="k-cta" onClick={() => (last ? onDone() : setN(n + 1))} data-testid="intro-next">
            <NdIcon name={last ? "place" : "chev"} /><span>{say(last ? "app.intro.to_place" : "app.intro.next")}</span>
          </button>
        </section>
      </div>
    </main>
  );
}
