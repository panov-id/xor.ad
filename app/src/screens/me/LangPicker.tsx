// "Me → Language": the splash's list (the same rows, the same keep) under the sub-page's frame. A pick other than
// the page's language reloads it in the new one (i18n.ts keep). No sheet of its own: w2_lang is the splash's.
import { useState } from "react";
import { keep, LANG, listed, nameOf, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { SubPage } from "./parts";

export function LangPicker({ onBack }: { onBack: () => void }) {
  const [pick, setPick] = useState(LANG);
  return (
    <SubPage name="lang" title={say("web.lang.title")} onBack={onBack}
      foot={
        // lang.svg: a pick first, then the check confirms (and reloads in the new language)
        <button type="button" className="cta cta-primary" aria-label={nameOf(pick)} onClick={() => { if (keep(pick)) onBack(); }} data-testid="lang-go"><NdIcon name="check" /></button>
      }>
      <ul className="k-langs">
        {listed().map((lang) => (
          <li key={lang}>
            <button type="button" className="k-fact k-fact-btn" lang={lang} aria-current={lang === pick ? "true" : undefined} data-on={lang === pick ? "" : undefined}
              onClick={() => setPick(lang)} data-testid={`lang-${lang}`}>
              <span className="k-badge" data-c="1"><NdIcon name="lang" /></span><span>{nameOf(lang)}</span>
            </button>
          </li>
        ))}
      </ul>
    </SubPage>
  );
}
