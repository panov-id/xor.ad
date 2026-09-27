// The composer (the "your phrase" of screen 03's sheet, depth's Write screen):
// a text up to the node's own limit (GET /limits), a mode, one button. The
// node's answer is shown as it is (§8.3; P1): 200 — the phrase is out, 202 —
// a person reads it first; a refusal names its reason in the words of
// refusal-wordings, and the text stays in the field.

import { useEffect, useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { say } from "../locales/say.ts";
import { modes, sayPhrase, type Mode, type Sent } from "../api/actions.ts";
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import "./feed.css";

// The steps of a circle the node takes (area_radius, §8.3).
const STEPS: Radius[] = [100, 300, 1000, 3000, 10000];

export function Composer(
  { client, at, radius, onSent, onBack }: {
    client: Client;
    at: { lat: number; lon: number };
    radius: Radius;
    onSent: (sent: Exclude<Sent, { state: "refused" }>, text: string) => void;
    onBack: () => void;
  },
) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("alone");
  // The zone starts at the feed's circle and is the phrase's own from here.
  const [zone, setZone] = useState<Radius>(radius);
  // A discount makes the phrase a neighbour's offer (offers spec; feed.ts
  // takes discount_value with conditions): the card shows it, a like on it
  // makes the match at once (§8.5). Empty — an ordinary phrase.
  const [discount, setDiscount] = useState("");
  const [conditions, setConditions] = useState("");
  // The node's limit, not a number of our own: GET /limits says what POST /feed
  // refuses by (protocol, 2026-09-22). Until it answers, the contract's 128.
  const [limit, setLimit] = useState(128);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    client.limits().then((l) => setLimit(l.phrase_length)).catch(() => {});
  }, [client]);

  const used = [...text].length;
  const empty = text.trim() === "";

  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      const sent = await sayPhrase(client, {
        text: text.trim(), mode, ...at, radius: zone,
        ...(discount.trim() ? { discount_value: discount.trim(), ...(conditions.trim() ? { conditions: conditions.trim() } : {}) } : {}),
      });
      if (sent.state === "refused") setRefused(sent.why);
      else onSent(sent, text.trim());
    } catch (e) {
      setRefused(say("web.composer.failed", { why: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  // Sheet 04: the phrase with what is left of it, the mode as segments, the
  // zone as a scheme of the steps (not a map: the point is not drawn where it
  // is), the discount folded, and the button with its reason under the text.
  // What the sheet shows and the page has no data for — the place's name, the
  // quota "free 2 of 4" — is left out rather than made up (WS4).
  return (
    <main className="screen composer-screen" data-screen="composer">
      <HeaderScreen title={say("write.title")} onBack={onBack} backLabel={say("common.back")} />
      <div className="composer-label">
        <label htmlFor="composer-text">{say("web.composer.phrase")}</label>
        <span className="composer-mono" data-testid="counter">{say("web.composer.left", { n: limit - used })}</span>
      </div>
      <textarea
        id="composer-text"
        className="composer-field"
        value={text}
        maxLength={limit * 4}
        onChange={(e) => setText([...e.target.value].slice(0, limit).join(""))}
        rows={3}
        data-testid="text"
        placeholder={say("web.composer.placeholder")}
      />
      <div className="composer-label"><span id="composer-mode">{say("web.composer.mode")}</span></div>
      <div className="composer-segments" role="radiogroup" aria-labelledby="composer-mode" data-testid="mode" data-value={mode}>
        {modes().map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} className={mode === m.value ? "on" : ""}
            onClick={() => setMode(m.value)} data-testid={`mode-${m.value}`}>{m.label}</button>
        ))}
      </div>
      <div className="composer-label">
        <span id="composer-zone">{say("web.composer.zone")}</span>
        <span>{say("web.composer.scheme")}</span>
      </div>
      <svg className="composer-scheme" viewBox="0 0 343 120" aria-hidden="true">
        {STEPS.map((r, i) => (
          <circle key={r} cx="171.5" cy="60" r={10 + i * 12} className={r === zone ? "on" : r < zone ? "in" : ""} />
        ))}
        <circle cx="171.5" cy="60" r="4" className="dot" />
      </svg>
      <div className="composer-steps" role="radiogroup" aria-labelledby="composer-zone" data-testid="zone" data-value={zone}>
        {STEPS.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={zone === r} className={zone === r ? "on" : ""}
            onClick={() => setZone(r)} data-testid={`zone-${r}`}>
            {r < 1000 ? say("web.feed.m", { n: r }) : say("web.feed.km", { n: r / 1000 })}
          </button>
        ))}
      </div>
      <p className="composer-mono composer-center">{say("web.composer.linked")}</p>
      <details className="offer-fields composer-offer" data-testid="offer-fields">
        <summary><span>{say("web.composer.offer")}</span><span className="composer-aside">{say("web.composer.oneOffer")}</span></summary>
        <label>
          {say("web.composer.discount")}
          <input value={discount} onChange={(e) => setDiscount(e.target.value.slice(0, 200))} data-testid="discount" placeholder="−10 %" />
        </label>
        <label>
          {say("web.composer.conditions")}
          <input value={conditions} onChange={(e) => setConditions(e.target.value.slice(0, 200))} data-testid="conditions" placeholder={say("web.composer.conditions_hint")} />
        </label>
      </details>
      {refused && <p className="error" data-testid="refused" style={{ whiteSpace: "pre-line" }}>{refused}</p>}
      <footer className="composer-bar">
        <span className="composer-aside">{empty ? say("web.composer.textFirst") : ""}</span>
        <Button type="button" kind="primary" disabled={empty || busy} onClick={send} data-testid="send">
          {busy ? "…" : say("write.send")}
        </Button>
      </footer>
    </main>
  );
}
