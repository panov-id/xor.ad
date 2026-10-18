// The phrase for the feed (sosed Dusk: w3_composer): the phrase in its lime card with its life and the letters left,
// how one is going (alone, with friends, party), who hears it (the circle's five steps), how many more live phrases
// the node takes, and «say it to the yard». Saying it and the node's refusals are the platform's
// (depth/web-platform/phrase.ts, the web's composer says the same); the phrase's life is the core's
// (depth/core/life.ts PHRASE_LIFE_SECONDS). The web's testids: text, send, refused, counter; new ones:
// composer-back, mode-<mode>, zone-<m>, live-left.
//
// The desktop (desktop_1440_Write) adds the rail, the yard's line over the title and «how neighbours will see it» beside the form
// (the feed's own tile); below 1440 they are not shown (tokens/wide.css). Not here yet: the neighbour's offer (discount and conditions).
import { useEffect, useState } from "react";
import type { Client, Radius } from "@sdk/client.ts";
import { PHRASE_LIFE_SECONDS } from "@sdk/life.ts";
import { createPhrase, type Mode, type Sent } from "@platform/phrase.ts";
import { failedLine, LANG, label, say } from "../i18n";
import { storedPlace } from "../place";
import { Icon } from "../shell/Icon";
import { chevronLeft, crowd, person, smile } from "../shell/icons";
import { Screen } from "../shell/Screen";
import { type Tab, TabBar } from "../shell/TabBar";
import { Tile } from "./feed-card";
import { canSay, lettersLeft, liveLeft } from "./composer-logic";
import { RADII, radiusWord } from "./feed-logic";

const phrase = createPhrase({ say, lang: LANG });
const MODES: Array<{ value: Mode; icon: string }> = [{ value: "alone", icon: person }, { value: "company", icon: crowd }, { value: "party", icon: smile }];
const life = (): { h: number; m: number } => ({ h: Math.floor(PHRASE_LIFE_SECONDS / 3600), m: Math.floor((PHRASE_LIFE_SECONDS % 3600) / 60) });

export interface ComposerState {
  text: string; mode: Mode; zone: Radius; limit: number; live: { left: number; of: number } | null; busy: boolean; refused: string | null;
  /** The place's name (the feed's, place.ts), for the yard's line; empty when none is chosen. */
  place?: string;
}
export interface ComposerActions {
  onText: (text: string) => void; onMode: (mode: Mode) => void; onZone: (zone: Radius) => void; onSend: () => void; onBack: () => void;
  onTab?: (tab: Tab) => void;
}

export function ComposerPane({ state, actions }: { state: ComposerState; actions: ComposerActions }) {
  const { h, m } = life();
  const left = state.live?.left ?? 1;
  return (
    <Screen name="composer" title={label("app.compose.title")} className="cp">
      <header className="cp-head">
        <button type="button" className="cp-back" aria-label={say("common.back")} onClick={actions.onBack} data-testid="composer-back"><Icon d={chevronLeft} /></button>
        {state.place && <p className="cp-where">{say("app.compose.where", { place: state.place })}</p>}
        <h1>{label("app.compose.title")}</h1>
        <p>{say("app.compose.sub", { h, m })}</p>
      </header>
      <aside className="cp-preview" aria-label={say("app.compose.preview")}>
        <h2>{say("app.compose.preview")}</h2>
        <ul className="cp-preview-tile">
          <Tile card={{ id: "preview", text: state.text.trim() || say("app.compose.your_phrase"), mode: state.mode, lang: LANG, like_count: 0 }}
            tone="lime" busy onOpen={() => {}} onLike={() => {}} testid="preview" />
        </ul>
        <p>{say("app.compose.preview_text", { zone: say(radiusWord(state.zone).key, { n: radiusWord(state.zone).n }), h, m })}</p>
      </aside>
      <form className="cp-sheet" onSubmit={(e) => { e.preventDefault(); actions.onSend(); }}>
        <div className="cp-card">
          <label htmlFor="cp-text">{say("app.compose.your_phrase")}</label>
          <textarea id="cp-text" value={state.text} onChange={(e) => actions.onText(e.target.value)} rows={2} data-testid="text" />
          <div className="cp-card-foot">
            <span>{say("app.compose.lives", { h, m })}</span>
            <span data-testid="counter">{say("app.compose.letters_left", { n: lettersLeft(state.text, state.limit) })}</span>
          </div>
        </div>
        <h2 id="cp-mode">{say("app.compose.going")}</h2>
        <div className="cp-modes" role="radiogroup" aria-labelledby="cp-mode">
          {MODES.map(({ value, icon }) => (
            <button key={value} type="button" role="radio" aria-checked={state.mode === value} className="cp-mode" onClick={() => actions.onMode(value)} data-testid={`mode-${value}`}>
              <Icon d={icon} /><span>{say(`app.compose.mode.${value}`)}</span>
            </button>
          ))}
        </div>
        <h2 id="cp-zone">{say("app.compose.hears")}</h2>
        <div className="cp-zones" role="radiogroup" aria-labelledby="cp-zone">
          {RADII.map((r) => {
            const w = radiusWord(r);
            return (
              <button key={r} type="button" role="radio" aria-checked={state.zone === r} className="cp-zone" onClick={() => actions.onZone(r)} data-testid={`zone-${r}`}>
                {say(w.key, { n: w.n })}
              </button>
            );
          })}
        </div>
        {state.live && (
          <div className="cp-live" data-testid="live-left">
            <span className="cp-ring" style={{ "--cp-ring-left": String(state.live.left / state.live.of) } as React.CSSProperties}>
              <span>{`${state.live.left}/${state.live.of}`}</span>
            </span>
            <p>{state.live.left > 0 ? say("app.compose.live_left", { n: state.live.left }) : say("app.compose.live_none", { n: state.live.of })}</p>
          </div>
        )}
        {state.refused && <p className="cp-refused" role="alert" data-testid="refused">{state.refused}</p>}
        <button type="submit" className="cp-send" aria-busy={state.busy || undefined} disabled={state.busy || !canSay(state.text, state.limit, left)} data-testid="send">
          {say("app.compose.send")}
        </button>
      </form>
      <TabBar active="feed" onSelect={actions.onTab} />
    </Screen>
  );
}

/** The composer held for the screen: the node's limit, one's own live phrases, the send. */
export function Composer({ client, radius, onSent, onBack, onTab }:
  { client: Client; radius: Radius; onSent: (sent: Exclude<Sent, { state: "refused" }>, text: string) => void; onBack: () => void; onTab?: (tab: Tab) => void }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("alone");
  const [zone, setZone] = useState<Radius>(radius);
  // The node's limit, not a number of our own (GET /limits); until it answers, the contract's 128.
  const [limit, setLimit] = useState(128);
  const [live, setLive] = useState<{ left: number; of: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    client.limits().then((l) => setLimit(l.phrase_length)).catch(() => {});
    client.profile().then((p) => setLive(liveLeft(p?.phrases?.length ?? 0))).catch(() => {});
  }, [client]);
  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      const at = storedPlace();
      const sent = await phrase.sayPhrase(client, { text: text.trim(), mode, lat: at.lat, lon: at.lon, radius: zone });
      if (sent.state === "refused") setRefused(sent.why);
      else onSent(sent, text.trim());
    } catch (e) {
      setRefused(failedLine(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ComposerPane state={{ text, mode, zone, limit, live, busy, refused, place: storedPlace().name }} actions={{
      onText: (t) => setText(t), onMode: setMode, onZone: setZone, onSend: () => void send(), onBack, onTab,
    }} />
  );
}
