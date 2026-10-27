// "Me → Language": the splash's list (the same rows, the same keep) under the sub-page's frame. A pick other than
// the page's language reloads it in the new one (i18n.ts keep). No sheet of its own: w2_lang is the splash's.
import { keep, LANG, listed, nameOf, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { SubPage } from "./parts";

export function LangPicker({ onBack }: { onBack: () => void }) {
  return (
    <SubPage name="lang" title={say("web.lang.title")} onBack={onBack}>
      <ul className="k-langs">
        {listed().map((lang) => (
          <li key={lang}>
            <button type="button" className="k-fact k-fact-btn" lang={lang} aria-current={lang === LANG ? "true" : undefined} data-on={lang === LANG ? "" : undefined}
              onClick={() => { if (keep(lang)) onBack(); }} data-testid={`lang-${lang}`}>
              <span className="k-badge" data-c="1"><NdIcon name="lang" /></span><span>{nameOf(lang)}</span>
            </button>
          </li>
        ))}
      </ul>
    </SubPage>
  );
}
