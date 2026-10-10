// The composer (the "your phrase" of screen 03's sheet, depth's Write screen):
// a text up to the node's own limit (GET /limits), a mode, one button. The
// node's answer is shown as it is (§8.3; P1): 200 — the phrase is out, 202 —
// a person reads it first; a refusal names its reason in the words of
// refusal-wordings (a dictionary phrase, never the model's own text), and the
// text stays in the field. Kit elements only (K5).

import { useComposer } from "./logic/useComposer.ts";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { say } from "../locales/say.ts";
import { modes, type Sent } from "../api/actions.ts";
import { Button } from "../ui/Button.tsx";
import { Disclosure } from "../ui/Disclosure.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { Field } from "../ui/Field.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Illustration } from "../ui/Illustration.tsx";
import { Info } from "../ui/Info.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Segments } from "../ui/Segments.tsx";
import { Textarea } from "../ui/Textarea.tsx";
import "./feed.css";

// The steps of a circle the node takes (area_radius, §8.3).
const STEPS: Radius[] = [100, 300, 1000, 3000, 10000];

export function Composer(
  { client, at, radius, onSent, onBack, brandClass }: {
    brandClass?: string;
    client: Client;
    at: { lat: number; lon: number };
    radius: Radius;
    onSent: (sent: Exclude<Sent, { state: "refused" }>, text: string) => void;
    onBack: () => void;
  },
) {
  const { text, setText, mode, setMode, zone, setZone, discount, setDiscount, conditions, setConditions, limit, busy, refused, used, empty, send } =
    useComposer({ client, at, radius, onSent });

  // Sheet 04: the phrase with what is left of it, the mode as segments, the
  // zone as a scheme of the steps (not a map: the point is not drawn where it
  // is), the discount folded, and the button with its reason under the text.
  // What the sheet shows and the page has no data for — the place's name, the
  // quota "free 2 of 4" — is left out rather than made up (WS4).
  const title = say("write.title");
  return (
    <Screen name="composer" title={title} className={brandClass} header={<HeaderScreen title={title} onBack={onBack} backLabel={say("common.back")} />}>
      <Textarea
        label={say("web.composer.phrase")}
        value={text}
        onChange={(next) => setText([...next].slice(0, limit).join(""))}
        rows={3}
        data-testid="text"
        placeholder={say("web.composer.placeholder")}
      />
      <p className="ui-hint" data-testid="counter">{say("web.composer.left", { n: limit - used })}</p>
      <Segments
        label={say("web.composer.mode")}
        value={mode}
        onChange={(next) => setMode(next as typeof mode)}
        testid="mode"
        options={modes().map((m) => ({ value: m.value, label: m.label, testid: `mode-${m.value}` }))}
      />
      <p className="ui-hint">{say("web.composer.scheme")}</p>
      <Illustration viewBox="0 0 343 120" size={343} height={120}>
        {STEPS.map((r, i) => (
          <circle key={r} cx="171.5" cy="60" r={10 + i * 12} className={r === zone ? "ui-scheme-on" : r < zone ? "ui-scheme-in" : "ui-scheme"} />
        ))}
        <circle cx="171.5" cy="60" r="4" className="ui-scheme-dot" />
      </Illustration>
      <Segments
        label={say("web.composer.zone")}
        value={String(zone)}
        onChange={(next) => setZone(Number(next) as Radius)}
        testid="zone"
        options={STEPS.map((r) => ({ value: String(r), label: r < 1000 ? say("web.feed.m", { n: r }) : say("web.feed.km", { n: r / 1000 }), testid: `zone-${r}` }))}
      />
      <div className="ui-info-row"><Info label={say("web.composer.zone")} data-testid="composer-info"><p>{say("web.composer.linked")}</p></Info></div>
      <Disclosure summary={say("web.composer.offer")} data-testid="offer-fields">
        <p className="ui-hint">{say("web.composer.oneOffer")}</p>
        <Field label={say("web.composer.discount")} value={discount} onChange={(next) => setDiscount(next.slice(0, 200))} data-testid="discount" placeholder="−10 %" autoComplete="off" />
        <Field label={say("web.composer.conditions")} value={conditions} onChange={(next) => setConditions(next.slice(0, 200))} data-testid="conditions" placeholder={say("web.composer.conditions_hint")} autoComplete="off" />
      </Disclosure>
      {refused && <ErrorLine data-testid="refused">{refused}</ErrorLine>}
      <Button type="button" kind="primary" icon="send" className="ui-send-wide" aria-label={say("write.send")} aria-busy={busy} disabled={empty || busy} reason={empty ? say("web.composer.textFirst") : undefined} onClick={send} data-testid="send" />
    </Screen>
  );
}
