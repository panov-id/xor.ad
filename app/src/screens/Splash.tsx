// The prototype's splash (docs/newdesign/proto/splash.html, splash-lang.html). The language list first, once per device
// (the page's own language ticked; a tap keeps one, «continue» keeps the ticked); then the yard with the brand's glass card,
// the tagline, what it is not, and the ways in: start, the paper code, moving here. Testids: start, restore, arrive;
// lang, lang-<code>, lang-go.
import { useState } from "react";
import { brand } from "@brand";
import { asked, keep, LANG, LANGUAGES, listed, nameOf, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { Logo, Scene } from "../shell/Scene";

export function Splash({ onStart, onRestore, onArrive }: { onStart: () => void; onRestore: () => void; onArrive: () => void }) {
  const [passed, setPassed] = useState(asked);
  if (!passed) {
    return (
      <main className="k-screen" data-screen="splash" data-state="lang">
        <div className="k-col">
          <section className="k-panel k-head">
            <div className="k-row">
              <Logo size={52} />
              <div className="k-stack"><h1 className="k-title">{say("web.lang.title")}</h1><p className="k-sub">{say("app.lang.hint", { n: LANGUAGES.length })}</p></div>
            </div>
          </section>
          <section className="k-panel k-grow k-pad8">
            <ul className="k-langs" data-testid="lang">
              {listed().map((lang) => (
                <li key={lang}>
                  <button type="button" className="k-fact k-fact-btn" lang={lang} aria-current={lang === LANG ? "true" : undefined} data-on={lang === LANG ? "" : undefined}
                    data-testid={`lang-${lang}`} onClick={() => { if (keep(lang)) setPassed(true); }}>
                    <span className="k-badge" data-c="1"><NdIcon name="lang" /></span><span>{nameOf(lang)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="k-panel k-actions">
            <button type="button" className="k-cta" onClick={() => { if (keep(LANG)) setPassed(true); }} data-testid="lang-go"><NdIcon name="chev" /><span>{say("web.offer.continue")}</span></button>
          </section>
        </div>
      </main>
    );
  }
  return (
    <main className="k-screen" data-screen="splash">
      <div className="k-col">
        <section className="k-panel k-grow k-splash">
          <Scene kind="splash">
            <div className="k-glass"><Logo size={44} /><div className="k-stack"><b>{brand.name}</b><span className="k-sub">{brand.host}</span></div></div>
          </Scene>
          <div className="k-stack"><h1 className="k-title k-title-big">{say("web.splash.tagline")}</h1></div>
          <p className="k-sub">{say("web.splash.vanishes")}</p>
        </section>
        <section className="k-panel k-actions k-stack">
          <button type="button" className="k-cta" onClick={onStart} data-testid="start"><NdIcon name="chev" /><span>{say("web.splash.start")}</span></button>
          <div className="k-two">
            <button type="button" className="k-way" onClick={onRestore} data-testid="restore"><span className="k-badge" data-c="1"><NdIcon name="paper" /></span><span>{say("web.splash.haveCode")}</span></button>
            <button type="button" className="k-way" onClick={onArrive} data-testid="arrive"><span className="k-badge" data-c="3"><NdIcon name="move" /></span><span>{say("web.splash.arrive")}</span></button>
          </div>
        </section>
      </div>
    </main>
  );
}
