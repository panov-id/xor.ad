// The composer (the "your phrase" of screen 03's sheet, depth's Write screen):
// a text up to the node's own limit (GET /limits), a mode, one button. The
// node's answer is shown as it is (§8.3; P1): 200 — the phrase is out, 202 —
// a person reads it first; a refusal names its reason in the words of
// refusal-wordings, and the text stays in the field.

import { useEffect, useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { say } from "../locales/say.ts";
import { MODES, sayPhrase, type Mode, type Sent } from "../api/actions.ts";

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
        text: text.trim(), mode, ...at, radius,
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

  return (
    <main className="screen composer" data-screen="composer">
      <header>
        <h1>{say("write.title")}</h1>
        <button type="button" onClick={onBack} data-testid="back">{say("common.back")}</button>
      </header>
      <p className="muted">{say("web.composer.hint")}</p>
      <label>
        {say("web.composer.phrase")}
        <textarea
          value={text}
          maxLength={limit * 4}
          onChange={(e) => setText([...e.target.value].slice(0, limit).join(""))}
          rows={4}
          data-testid="text"
          placeholder={say("web.composer.placeholder")}
        />
      </label>
      <span className="muted" data-testid="counter">{used} / {limit}</span>
      <label>
        {say("web.composer.mode")}
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} data-testid="mode">
          {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>
      <details className="offer-fields" data-testid="offer-fields">
        <summary className="muted">{say("web.composer.offer")}</summary>
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
      <button type="button" className="primary" disabled={empty || busy} onClick={send} data-testid="send">
        {busy ? "…" : say("write.send")}
      </button>
    </main>
  );
}
