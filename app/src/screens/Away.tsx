// w2_away (sosed Dusk): a step away is on (POST /away; web screens/Me.tsx Away). Until when, what it did
// (the phrases are down, the talks wait), and the way back early (DELETE /away). The clock is the core's
// (depth/core/move_flow.ts awayClock); at the end the screen leaves by itself.
// The same testids as the web's: away-line, away-return, error.
import { useEffect, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { awayClock } from "@sdk/move_flow.ts";
import { label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { flag, hourglass, undo } from "../shell/icons";
import { Screen } from "../shell/Screen";
import { MoveBar, MoveSheet } from "./move-parts";

export function Away({ client, until, onBack }: { client: Client; until: number; onBack: () => void }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clock = awayClock(until, now);
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => { if (clock.over) onBack(); }, [clock.over]); // eslint-disable-line react-hooks/exhaustive-deps

  function back() {
    if (busy) return;
    setBusy(true);
    setError(null);
    client.comeBack().then(onBack, (e: Error) => { setError(e.message); setBusy(false); });
  }

  return (
    <Screen name="away" title={label("app.away.title")} className="mv">
      <MoveBar />
      <MoveSheet className="mv-center mv-away" foot={
        <button type="button" className="cta cta-primary" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={back} data-testid="away-return">
          <Icon d={undo} /><span>{say("app.away.back")}</span>
        </button>
      }>
        <span className="mv-circle mv-circle-away"><Icon d={hourglass} /></span>
        <h1>{say("app.away.title")}</h1>
        <p className="mv-note" data-testid="away-line">{say("app.away.sub", { time: clock.time })}</p>
        <dl className="mv-rows">
          <div><dt>{say("app.away.until")}</dt><dd data-testid="away-until">{clock.time}</dd></div>
          <div><dt>{say("app.away.phrases")}</dt><dd>{say("app.away.phrases_down")}</dd></div>
          <div><dt>{say("app.away.talks")}</dt><dd>{say("app.away.talks_wait")}</dd></div>
        </dl>
        {error && <div data-testid="error"><p className="gate-error mv-error" role="alert"><Icon d={flag} /><span>{error}</span></p></div>}
      </MoveSheet>
    </Screen>
  );
}
