// Screen 01 (panel/design/sheets/screen-01-04-05.svg): one line of what this
// is, one of what it is not, and the way in. The icon frame of the sheet is
// not drawn yet.

import { say } from "../api/me.ts";
import { BRAND, NAMES } from "../config.ts";
import { Button } from "../ui/Button.tsx";

export function Splash({ onStart, onRestore, onArrive }: { onStart: () => void; onRestore: () => void; onArrive: () => void }) {
  return (
    <main className="screen splash" data-screen="splash">
      <p className="brand">{NAMES[BRAND] ?? BRAND}</p>
      <h1>{say("web.splash.tagline")}</h1>
      <p className="muted">{say("web.splash.vanishes")}</p>
      <Button type="button" kind="primary" onClick={onStart} data-testid="start">
        {say("web.splash.start")}
      </Button>
      <Button type="button" onClick={onRestore} data-testid="restore">
        {say("web.splash.haveCode")}
      </Button>
      <Button type="button" onClick={onArrive} data-testid="arrive">
        {say("move.inItem")}
      </Button>
    </main>
  );
}
