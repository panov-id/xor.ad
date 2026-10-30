// w2_away (sosed Dusk): a step away is on (POST /away; web screens/Me.tsx Away). Until when, what it did
// (the phrases are down, the talks wait), and the way back early (DELETE /away). The clock is the core's
// (depth/core/move_flow.ts awayClock); at the end the screen leaves by itself.
// The same testids as the web's: away-line, away-return, error.
import { useEffect, useState, type ReactNode } from "react";
import type { Client } from "@sdk/client.ts";
import { awayClock } from "@sdk/move_flow.ts";
import { failedLine, label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { flag, hourglass, undo } from "../shell/icons";
import { NdIcon } from "../shell/NdIcon";
import { Screen } from "../shell/Screen";
import { useMinWidth } from "../shell/useMinWidth";
import { MoveBar, MoveSheet } from "./move-parts";

// desktop_1440 6-me away.svg and departure-done.svg: no rail, two columns: a big card (its mark, the brand under it,
// the words below the card) and a narrow one (a small mark and the facts) with the way on under it.
export function SplitFrame({ name, title, mark, words, small, facts, foot }: { name: string; title: string; mark: ReactNode; words: ReactNode; small: ReactNode; facts: ReactNode; foot: ReactNode }) {
  return (
    <Screen name={name} title={title} className="k-screen k-split" data-split="">
      <section className="k-panel k-split-main">
        <div className="k-split-card"><span className="k-split-mark">{mark}</span><MoveBar /></div>
        <div className="k-split-words">{words}</div>
      </section>
      <aside className="k-split-side">
        <div className="k-panel k-split-info"><span className="k-split-small">{small}</span>{facts}</div>
        <div className="k-panel k-split-foot">{foot}</div>
      </aside>
    </Screen>
  );
}

export function Away({ client, until, onBack }: { client: Client; until: number; onBack: () => void }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clock = awayClock(until, now);
  const desk = useMinWidth("--bp-desktop");
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => { if (clock.over) onBack(); }, [clock.over]); // eslint-disable-line react-hooks/exhaustive-deps

  function back() {
    if (busy) return;
    setBusy(true);
    setError(null);
    client.comeBack().then(onBack, (e: Error) => { setError(failedLine(e)); setBusy(false); });
  }

  const cta = (
    <button type="button" className="cta cta-primary" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={back} data-testid="away-return">
      <Icon d={undo} /><span>{say("app.away.back")}</span>
    </button>
  );
  // desktop-1440/1920 away.svg: the pane says the facts as plain lines under the door
  const lines = (
    <>
      <p className="k-note">{say("app.away.until")} · <span data-testid="away-until">{clock.time}</span></p>
      <p className="k-note">{say("app.away.phrases")} · {say("app.away.phrases_down")}</p>
      <p className="k-note">{say("app.away.talks")} · {say("app.away.talks_wait")}</p>
      {error && <div data-testid="error"><p className="k-note k-error" role="alert"><Icon d={flag} /><span>{error}</span></p></div>}
    </>
  );
  if (desk) return (
    <SplitFrame name="away" title={label("app.away.title")} mark={<NdIcon name="door" className="icon" />} small={<NdIcon name="door" className="icon" />} foot={cta} facts={lines}
      words={<><h1>{say("app.away.title")}</h1><p className="k-note" data-testid="away-line">{say("app.away.sub", { time: clock.time })}</p></>} />
  );
  return (
    <Screen name="away" title={label("app.away.title")} className="k-screen">
      <div className="k-col">
      <MoveBar />
      <MoveSheet className="k-centre-col" foot={
        <button type="button" className="cta cta-primary" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={back} data-testid="away-return">
          <Icon d={undo} /><span>{say("app.away.back")}</span>
        </button>
      }>
        <span className="k-mark-110"><Icon d={hourglass} /></span>
        <h1>{say("app.away.title")}</h1>
        <p className="k-note" data-testid="away-line">{say("app.away.sub", { time: clock.time })}</p>
        <dl className="k-pairs">
          <div><dt>{say("app.away.until")}</dt><dd data-testid="away-until">{clock.time}</dd></div>
          <div><dt>{say("app.away.phrases")}</dt><dd>{say("app.away.phrases_down")}</dd></div>
          <div><dt>{say("app.away.talks")}</dt><dd>{say("app.away.talks_wait")}</dd></div>
        </dl>
        {error && <div data-testid="error"><p className="k-note k-error" role="alert"><Icon d={flag} /><span>{error}</span></p></div>}
      </MoveSheet>
      </div>
    </Screen>
  );
}
