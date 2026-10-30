// w4_theme «Look» (docs/newdesign4 screen 113 `theme`, owner 2026-10-30): style — four stone themes; when — by the sun,
// day, night; accent — eight gems. Every pick is kept on this device (brands/sosed/theme.ts) and put on <html> at once.
// Testids: theme-<id>, when-<id>, accent-<id>.
import { useState } from "react";
import { say } from "../../i18n";
import {
  type Accent, ACCENTS, applyTheme, type Choice, readAccent, readChoice, readWhen, saveAccent, saveChoice, saveWhen,
  THEMES, type When, WHENS,
} from "../../brands/sosed/theme";
import { SubPage } from "./parts";

export function Theme({ onBack }: { onBack: () => void }) {
  const [theme, setTheme] = useState<Choice>(() => readChoice());
  const [when, setWhen] = useState<When>(() => readWhen());
  const [accent, setAccent] = useState<Accent>(() => readAccent());
  const pick = <T,>(save: (v: T) => void, set: (v: T) => void) => (v: T) => { save(v); applyTheme(); set(v); };
  return (
    <SubPage name="theme" title={say("app.theme.title")} onBack={onBack}>
      <div className="k-stack">
        <p className="k-group-head">{say("app.theme.style")}</p>
        <div role="radiogroup" aria-label={say("app.theme.style")} className="k-themes">
          {THEMES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={t === theme} className="k-hub-tile"
              onClick={() => pick(saveChoice, setTheme)(t)} data-testid={`theme-${t}`}>
              <span className="k-badge k-swatch" data-swatch={t} aria-hidden="true" />
              <span className="k-row-name">{say(`app.theme.${t}`)}</span>
            </button>
          ))}
        </div>
        <p className="k-group-head">{say("app.theme.when")}</p>
        <div role="radiogroup" aria-label={say("app.theme.when")} className="k-chips">
          {WHENS.map((w) => (
            <button key={w} type="button" role="radio" aria-checked={w === when} className="k-chip"
              onClick={() => pick(saveWhen, setWhen)(w)} data-testid={`when-${w}`}>{say(`app.theme.when_${w}`)}</button>
          ))}
        </div>
        <p className="k-group-head">{say("app.theme.accent")}</p>
        <div role="radiogroup" aria-label={say("app.theme.accent")} className="k-accents">
          {ACCENTS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={a === accent} aria-label={say(`app.accent.${a}`)}
              className="k-accent" data-accent-dot={a} onClick={() => pick(saveAccent, setAccent)(a)} data-testid={`accent-${a}`} />
          ))}
        </div>
      </div>
      <p className="k-sub">{say("app.theme.kept")}</p>
    </SubPage>
  );
}
