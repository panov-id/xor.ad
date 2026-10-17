// w2_splash and w2_splash-lang (sosed Dusk, mobile_390_*): the web's Splash (web/src/screens/Splash.tsx)
// in the new design. Same flow: the language list first, once per device (the page's own language
// ticked, one tap keeps it); then the tagline, what it is not, and the ways in. Same testids:
// start, restore, arrive; lang, lang-<code>.
import { useState } from "react";
import { brand } from "@brand";
import { asked, keep, LANG, LANGUAGES, listed, nameOf, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { arrowRight, check, home, key, tileIcons } from "../shell/icons";
import { Screen } from "../shell/Screen";

export function Splash({ onStart, onRestore, onArrive }: { onStart: () => void; onRestore: () => void; onArrive: () => void }) {
  const [passed, setPassed] = useState(asked);
  if (!passed) {
    return (
      <Screen name="splash" title={say("web.lang.title")} className="splash splash-lang" data-state="lang">
        <div className="col">
          <header className="lang-head" aria-hidden="true">
            <span className="mark"><Icon d={home} /></span>
            <span className="word">{brand.name}</span>
          </header>
          <div className="lang-copy">
            <h1>{say("web.lang.title")}</h1>
            <p>{say("app.lang.hint", { n: LANGUAGES.length })}</p>
          </div>
          <ul className="lang-list" data-testid="lang">
            {listed().map((lang) => (
              <li key={lang}>
                <button type="button" lang={lang} aria-current={lang === LANG ? "true" : undefined} data-testid={`lang-${lang}`}
                  onClick={() => { if (keep(lang)) setPassed(true); }}>
                  <span>{nameOf(lang)}</span>
                  {lang === LANG ? <Icon d={check} /> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Screen>
    );
  }
  return (
    <Screen name="splash" title={say("web.splash.tagline")} className="splash">
      <div className="poster" aria-hidden="true">
        <div className="hero"><Icon d={home} /></div>
        {tileIcons.map((d, i) => (
          <div key={i} className="tile" style={{ left: `var(--tile-${i + 1}-x)`, top: `var(--tile-${i + 1}-y)` }}><Icon d={d} /></div>
        ))}
      </div>
      <div className="col entry">
        <div className="copy">
          <h1>{say("web.splash.tagline")}</h1>
          <p>{say("web.splash.vanishes")}</p>
        </div>
        <div className="ways">
          <button type="button" className="cta cta-primary" onClick={onStart} data-testid="start">
            <Icon d={arrowRight} /><span>{say("web.splash.start")}</span>
          </button>
          <button type="button" className="cta cta-quiet" onClick={onRestore} data-testid="restore">
            <Icon d={key} /><span>{say("web.splash.haveCode")}</span>
          </button>
          {/* «arrive» is not one of the two ways in: a quiet link under them (web, owner 12.10.2026) */}
          <button type="button" className="link" onClick={onArrive} data-testid="arrive">{say("web.splash.arrive")}</button>
        </div>
      </div>
    </Screen>
  );
}
