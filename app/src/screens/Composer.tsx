// The phrase for the feed (sosed Dusk: w3_composer): the phrase in its lime card with its life and the letters left,
// how one is going (alone, with friends, party), who hears it (the circle's five steps), how many more live phrases
// the node takes, and «say it to the yard». Saying it and the node's refusals are the platform's
// (depth/web-platform/phrase.ts, the web's composer says the same); the phrase's life is the core's
// (depth/core/life.ts PHRASE_LIFE_SECONDS). The web's testids: text, send, refused, counter; new ones:
// composer-back, mode-<mode>, zone-<m>, live-left.
// The look is the prototype's (composer.html); its offer switch is not here yet (the neighbour's offer has no app path).
import { useEffect, useState } from "react";
import type { Client, Radius } from "@sdk/client.ts";
import { PHRASE_LIFE_SECONDS } from "@sdk/life.ts";
import { createPhrase, type Mode, type Sent } from "@platform/phrase.ts";
import { PhraseRejected } from "./MyPhrase";
import { failedLine, LANG, label, say } from "../i18n";
import { storedPlace } from "../place";
import { NdIcon } from "../shell/NdIcon";
import { type Tab, TabBar } from "../shell/TabBar";
import { useMinWidth } from "../shell/useMinWidth";
import { RADIUS_ICON, radiusText } from "./feed-radius";
import { canSay, lettersLeft, liveLeft, ownPhrases } from "./composer-logic";
import { RADII, radiusWord, textSize } from "./feed-logic";

const phrase = createPhrase({ say, lang: LANG });
const MODES: Array<{ value: Mode; icon: string; c: string }> = [{ value: "alone", icon: "alone", c: "5" }, { value: "company", icon: "friends", c: "6" }, { value: "party", icon: "party", c: "1" }];
const life = (): { h: number; m: number } => ({ h: Math.floor(PHRASE_LIFE_SECONDS / 3600), m: Math.floor((PHRASE_LIFE_SECONDS % 3600) / 60) });

export interface ComposerState {
  text: string; mode: Mode; zone: Radius; limit: number; live: { left: number; of: number } | null; busy: boolean; refused: string | null;
  /** The place's name (the feed's, place.ts), for the yard's line; empty when none is chosen. */
  place?: string;
}
export interface ComposerActions {
  onText: (text: string) => void; onMode: (mode: Mode) => void; onZone: (zone: Radius) => void; onSend: () => void; onBack: () => void;
  onTab?: (tab: Tab) => void;
  /** The «where» row: the place screen (App.tsx, the feed's own onPlace). */
  onPlace?: () => void;
}

export function ComposerPane({ state, actions }: { state: ComposerState; actions: ComposerActions }) {
  const { h, m } = life();
  const left = state.live?.left ?? 1;
  const letters = lettersLeft(state.text, state.limit);
  // desktop 3-nearby composer.svg: at the desktop the composer stands in the right pane beside the feed (wide.css .k-card-pane)
  const desk = useMinWidth("--bp-desktop");
  // the prototype's composer (docs/newdesign/proto/composer.html, composer-refused): the bar with close and the title,
  // the phrase's panel (text, live dots, letters ring), the settings panel (three modes, five circles), the send panel
  return (
    <main className={desk ? "k-screen k-card-pane" : "k-screen k-over"} data-screen="composer">
      <form className="k-col" onSubmit={(e) => { e.preventDefault(); actions.onSend(); }}>
        <header className="k-row k-bar">
          <button type="button" className="k-bar-btn" aria-label={say("common.back")} onClick={actions.onBack} data-testid="composer-back"><NdIcon name="close" /></button>
          <h1 className="k-bar-title">{label("app.compose.title")}</h1>
        </header>
        <section className="k-panel k-card k-write">
          <label htmlFor="cp-text" className="k-sub">{say("app.compose.sub", { h, m })}</label>
          <textarea id="cp-text" className="k-card-text k-write-text" value={state.text} onChange={(e) => actions.onText(e.target.value)}
            placeholder={say("app.compose.your_phrase")} rows={3} data-testid="text" data-size={textSize(state.text)} />
          <div className="k-write-foot">
            {state.live
              ? <span className="k-dots" data-testid="live-left" title={state.live.left > 0 ? say("app.compose.live_left", { n: state.live.left }) : say("app.compose.live_none", { n: state.live.of })}>
                  {Array.from({ length: state.live.of }, (_, k) => <span key={k} data-on={k < state.live!.left ? "" : undefined} />)}
                  <span className="k-meta">{`${state.live.left}/${state.live.of}`}</span>
                </span>
              : <span />}
            <span className="k-ring" data-testid="counter" style={{ "--k-ring": String(Math.max(0, letters) / state.limit) } as React.CSSProperties}
              aria-label={say("app.compose.letters_left", { n: letters })}><span>{letters}</span></span>
          </div>
        </section>
        {state.refused
          ? <section className="k-panel k-settings"><p className="k-note" role="alert" data-testid="refused"><NdIcon name="hourglass" /><span>{state.refused}</span></p></section>
          : (
            <section className="k-panel k-settings">
              {/* newdesign3 composer.html .row: the place and the circle, «where · tap to change» opens the place screen */}
              <button type="button" className="k-row k-where" onClick={actions.onPlace} disabled={!actions.onPlace} data-testid="composer-where">
                <span className="k-badge" data-c="2"><NdIcon name="place" /></span>
                <span className="k-stack"><span className="k-title">{`${state.place || say("web.place.none")} · ${radiusText(state.zone)}`}</span><span className="k-meta">{say("app.compose.where_change")}</span></span>
                <NdIcon name="chev" />
              </button>
              <div className="k-facts" role="radiogroup" aria-label={say("app.compose.going")}>
                {MODES.map(({ value, icon, c }) => (
                  <button key={value} type="button" role="radio" aria-checked={state.mode === value} className="k-fact k-fact-btn" data-on={state.mode === value ? "" : undefined}
                    onClick={() => actions.onMode(value)} data-testid={`mode-${value}`}>
                    <span className="k-badge" data-c={c}><NdIcon name={icon} /></span><span>{say(`app.compose.mode.${value}`)}</span>
                  </button>
                ))}
              </div>
              <div className="k-circles" role="radiogroup" aria-label={say("app.compose.hears")}>
                {RADII.map((r) => {
                  const w = radiusWord(r);
                  return (
                    <button key={r} type="button" role="radio" aria-checked={state.zone === r} aria-label={say(w.key, { n: w.n })} data-on={state.zone === r ? "" : undefined}
                      onClick={() => actions.onZone(r)} data-testid={`zone-${r}`}><NdIcon name={RADIUS_ICON[r]} /></button>
                  );
                })}
              </div>
            </section>
          )}
        <section className="k-panel k-actions">
          <button type="submit" className="k-cta" aria-busy={state.busy || undefined} disabled={state.busy || !canSay(state.text, state.limit, left)} data-testid="send">
            <NdIcon name="send" /><span>{say("app.compose.send")}</span>
          </button>
        </section>
      </form>
      <TabBar active="feed" onSelect={actions.onTab} railOnly />
    </main>
  );
}

/** The composer held for the screen: the node's limit, one's own live phrases, the send. */
export function Composer({ client, radius, onSent, onBack, onTab, onPlace }:
  { client: Client; radius: Radius; onSent: (sent: Exclude<Sent, { state: "refused" }>, text: string) => void; onBack: () => void; onTab?: (tab: Tab) => void; onPlace?: () => void }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("alone");
  const [zone, setZone] = useState<Radius>(radius);
  // The node's limit, not a number of our own (GET /limits); until it answers, the contract's 128.
  const [limit, setLimit] = useState(128);
  const [live, setLive] = useState<{ left: number; of: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  // docs/newdesign4 screen 38: the moderator's refusal has its own screen; a refusal of the moment (a pause, a limit) stays a line here
  const [rejected, setRejected] = useState<string | null>(null);
  useEffect(() => {
    client.limits().then((l) => setLimit(l.phrase_length)).catch(() => {});
    client.profile().then((p) => setLive(liveLeft(ownPhrases(p?.phrases)))).catch(() => {});
  }, [client]);
  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      const at = storedPlace();
      const sent = await phrase.sayPhrase(client, { text: text.trim(), mode, lat: at.lat, lon: at.lon, radius: zone });
      if (sent.state === "refused") { if (sent.why === say("web.phrase.refused_generic")) setRejected(sent.why); else setRefused(sent.why); }
      else onSent(sent, text.trim());
    } catch (e) {
      setRefused(failedLine(e));
    } finally {
      setBusy(false);
    }
  }
  if (rejected !== null) return <PhraseRejected text={text.trim()} why={rejected} onBack={() => setRejected(null)} onDelete={onBack} onEdit={() => setRejected(null)} />;
  return (
    <ComposerPane state={{ text, mode, zone, limit, live, busy, refused, place: storedPlace().name }} actions={{
      onText: (t) => setText(t), onMode: setMode, onZone: setZone, onSend: () => void send(), onBack, onTab, onPlace,
    }} />
  );
}
