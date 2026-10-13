// The language list of the splash (owner 12.10.2026: the language as a list): each language
// named in itself, the current one marked, one tap keeps it. The brand draws it in splash.css.
import { Icon } from "./Icon.tsx";

export function LangList({ langs, current, nameOf, onPick }: {
  langs: readonly string[];
  current: string;
  nameOf: (lang: string) => string;
  onPick: (lang: string) => void;
}) {
  return (
    <ul className="ui-card" data-part="lang-list" data-testid="lang">
      {langs.map((lang) => (
        <li key={lang}>
          <button type="button" lang={lang} aria-current={lang === current ? "true" : undefined} onClick={() => onPick(lang)} data-testid={`lang-${lang}`}>
            <Icon name="say" />
            <span>{nameOf(lang)}</span>
            {lang === current ? <Icon name="check" /> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
