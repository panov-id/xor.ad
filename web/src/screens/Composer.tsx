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

  // The phrase with what is left of it, the mode and the zone as pills, the
  // discount folded, and the button with its reason at the foot. The sheet's
  // second row is a phrase's time (1 h · 3 h · tonight), which the node does not
  // take: the zone's steps stand in that row instead, nothing is made up (WS4).
  const title = say("write.title");
  return (
    <Screen name="composer" title={title} className={brandClass} header={<HeaderScreen title={title} onBack={onBack} backLabel={say("common.back")} />}>
      {/* Sheets adaptive-*-composer-393: one panel 361×220 — what is left, the phrase, the mode and the
          zone as two rows of pills — and «send» at the foot; the zone's word and the offer stay under it. */}
      <div className="ui-compose" data-testid="compose-card">
        <p className="ui-hint" data-testid="counter">{say("web.composer.left", { n: limit - used })}</p>
        <Textarea
          label={say("web.composer.phrase")}
          value={text}
          onChange={(next) => setText([...next].slice(0, limit).join(""))}
          rows={1}
          data-testid="text"
          placeholder={say("web.composer.placeholder")}
        />
        <Segments
          label={say("web.composer.mode")}
          value={mode}
          onChange={(next) => setMode(next as typeof mode)}
          testid="mode"
          options={modes().map((m) => ({ value: m.value, label: m.label, testid: `mode-${m.value}` }))}
        />
        <Segments
          label={say("web.composer.zone")}
          value={String(zone)}
          onChange={(next) => setZone(Number(next) as Radius)}
          testid="zone"
          options={STEPS.map((r) => ({ value: String(r), label: r < 1000 ? say("web.feed.m", { n: r }) : say("web.feed.km", { n: r / 1000 }), testid: `zone-${r}` }))}
        />
      </div>
      <div className="ui-info-row"><Info label={say("web.composer.zone")} data-testid="composer-info"><p>{say("web.composer.linked")}</p></Info></div>
      <Disclosure summary={say("web.composer.offer")} data-testid="offer-fields">
        <p className="ui-hint">{say("web.composer.oneOffer")}</p>
        <Field label={say("web.composer.discount")} value={discount} onChange={(next) => setDiscount(next.slice(0, 200))} data-testid="discount" placeholder="−10 %" autoComplete="off" />
        <Field label={say("web.composer.conditions")} value={conditions} onChange={(next) => setConditions(next.slice(0, 200))} data-testid="conditions" placeholder={say("web.composer.conditions_hint")} autoComplete="off" />
      </Disclosure>
      {refused && <ErrorLine data-testid="refused">{refused}</ErrorLine>}
      <div data-part="foot">
        <Button type="button" kind="primary" icon="send" className="ui-send-wide" aria-label={say("write.send")} aria-busy={busy} disabled={empty || busy} reason={empty ? say("web.composer.textFirst") : undefined} onClick={send} data-testid="send" />
      </div>
    </Screen>
  );
}
