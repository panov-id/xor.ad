// "Me → Language": the splash's list (the same rows, the same keep) under the sub-page's frame. A pick other than
// the page's language reloads it in the new one (i18n.ts keep). No sheet of its own: w2_lang is the splash's.
import { keep, listed, nameOf, say } from "../../i18n";
import { SubPage } from "./parts";

export function LangPicker({ onBack }: { onBack: () => void }) {
  return (
    <SubPage name="lang" title={say("web.lang.title")} onBack={onBack}>
      <ul className="lang-list me-langs">
        {listed().map((lang) => (
          <li key={lang}><button type="button" lang={lang} onClick={() => { if (keep(lang)) onBack(); }} data-testid={`lang-${lang}`}>{nameOf(lang)}</button></li>
        ))}
      </ul>
    </SubPage>
  );
}
