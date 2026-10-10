// Screen 01 (panel/design/sheets/screen-01-04-05.svg): the page's language
// code in the corner, eight neighbourhood icons that come and go (all of them
// still under prefers-reduced-motion), one line of what this is, one of what
// it is not, and the ways in.
//
// The corner is the language the page speaks, and chooses it (WP-3; until
// then it only named it, WS1 in docs/design/web-vs-sheets_*): a person whose
// browser speaks something else finds their own language before the first
// word they would have to read. Each option is named in itself; choosing one
// reloads the page in it and is kept on this device (locales/say.ts).

import type { ReactNode } from "react";
import { say } from "../api/me.ts";
import { chooseLanguage, LANG, LANGUAGES, languageName } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Illustration } from "../ui/Illustration.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Select } from "../ui/Select.tsx";

// The sheet's icons, drawn in a 56 box: home, bench, teapot, domino, knight,
// bicycle, cat, tree — in the sheet's reading order.
const ICONS: ReactNode[] = [
  <path d="M6 30 L28 10 L50 30 M12 26 V48 H44 V26 M24 48 V36 H32 V48" />,
  <path d="M6 26 H50 M10 26 V46 M46 26 V46 M6 36 H50 M14 14 H42 V26" />,
  <path d="M14 24 H42 L40 46 H16 Z M42 28 L52 30 L48 40 L40 40 M22 24 C22 14 34 14 34 24 M24 12 H32" />,
  <><rect x="20" y="6" width="16" height="44" rx="3" /><path d="M20 28 H36" /><circle data-dot="" cx="28" cy="14" r="2.2" /><circle data-dot="" cx="24" cy="38" r="2.2" /><circle data-dot="" cx="32" cy="44" r="2.2" /></>,
  <path d="M16 48 H44 M18 44 C18 36 30 36 30 28 L24 30 L20 24 L30 12 C40 12 44 22 44 30 C44 36 40 40 40 44" />,
  <><circle cx="14" cy="40" r="9" /><circle cx="42" cy="40" r="9" /><path d="M14 40 L24 22 H36 L42 40 M24 22 L30 40 H14 M32 14 H38" /></>,
  <path d="M14 46 V24 L20 14 L26 22 H34 L40 14 L46 24 V46 Z M22 32 H24 M36 32 H38 M26 40 C28 43 32 43 34 40" />,
  <path d="M28 50 V32 M12 34 C8 22 20 8 28 8 C36 8 48 22 44 34 C40 40 16 40 12 34 Z" />,
];

export function Splash({ onStart, onRestore, onArrive }: { onStart: () => void; onRestore: () => void; onArrive: () => void }) {
  return (
    <Screen name="splash" title={say("web.splash.tagline")}>
      <div data-part="lang" data-testid="lang">
        <Select
          label={say("web.lang.title")}
          options={LANGUAGES.map((lang) => ({ value: lang, label: languageName(lang), lang }))}
          value={LANG}
          onChange={chooseLanguage}
        />
      </div>
      <div data-part="icons" aria-hidden="true">
        {ICONS.map((icon, i) => <Illustration key={i} viewBox="0 0 56 56" size={87}>{icon}</Illustration>)}
      </div>
      <h1>{say("web.splash.tagline")}</h1>
      <p>{say("web.splash.vanishes")}</p>
      <Button type="button" kind="primary" icon="watch" className="ui-wide" aria-label={say("web.splash.start")} onClick={onStart} data-testid="start" />
      <div className="ui-icon-row">
        <Button type="button" icon="key" className="ui-wide" aria-label={say("web.splash.haveCode")} onClick={onRestore} data-testid="restore" />
        <Button type="button" icon="arrive" className="ui-wide" aria-label={say("web.splash.arrive")} onClick={onArrive} data-testid="arrive" />
      </div>
    </Screen>
  );
}
