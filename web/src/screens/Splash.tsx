// Screen 01 (panel/design/sheets/screen-01-04-05.svg): one line of what this
// is, one of what it is not, and the way in. The icon frame of the sheet is
// not drawn yet.

import { BRAND, NAMES } from "../config.ts";

export function Splash({ onStart, onRestore }: { onStart: () => void; onRestore: () => void }) {
  return (
    <main className="screen splash" data-screen="splash">
      <p className="brand">{NAMES[BRAND] ?? BRAND}</p>
      <h1>Что говорят соседи рядом.</h1>
      <p className="muted">Сказанное исчезает.</p>
      <button type="button" className="primary" onClick={onStart} data-testid="start">
        Начать
      </button>
      <button type="button" onClick={onRestore} data-testid="restore">
        у меня есть бумажный код
      </button>
    </main>
  );
}
