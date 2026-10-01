import type { HTMLAttributes, ReactNode } from "react";
import { BRAND } from "../config.ts";
import { Icon } from "./Icon.tsx";
import type { Phase } from "./phase.ts";
import { Scene, titleInk } from "./Scene.tsx";

// What a screen hangs on the live step: a role, a testid, the step's own value
// for the specs (the feed's data-step, WD8).
type StepProps = HTMLAttributes<HTMLSpanElement> & { [data: `data-${string}`]: string | undefined };

// The kit's headers (components.svg §7), 56 tall, title 20/600 at x 16.
// HeaderFeed is the header with the step (owner 2026-09-19): the place and
// how many are near as a word, «Колонаки · рядом десятки», never a number;
// the step is live for a screen reader, and its span is there before the step
// is known, so the first word is announced too. The dot stands only with a
// step. HeaderScreen: back, title, an optional word action in accent-text, a
// hairline under.
// Comic (2026-10-01): with a `phase` the feed's header stands on the scene of
// that time of day at the feed's place (phase.ts), the title on a plate.
export function HeaderFeed({ place, step, action, stepProps, phase }: { place: string; step: string; action?: ReactNode; stepProps?: StepProps; phase?: Phase }) {
  return (
    <header className={phase ? "ui-header ui-header-scene" : "ui-header"} data-phase={phase} style={phase ? { color: titleInk(phase) } : undefined}>
      {phase ? <Scene brand={BRAND} phase={phase} /> : null}
      <h1 className="ui-header-title">
        {place}{step ? <span aria-hidden="true"> · </span> : null}<span aria-live="polite" {...stepProps}>{step}</span>
      </h1>
      {action}
    </header>
  );
}

// «назад» is the screen's word (say("common.back") or its own): a back button
// comes with its label, so the kit names no word of its own (check-web-i18n).
type Back = { onBack: () => void; backLabel: string } | { onBack?: undefined; backLabel?: undefined };

export function HeaderScreen({ title, onBack, backLabel, action }: { title: string; action?: ReactNode } & Back) {
  return (
    <header className="ui-header ui-header-rule">
      {onBack ? (
        <button type="button" className="ui-icon ui-icon-only" aria-label={backLabel} onClick={onBack} data-testid="back">
          <Icon name="back" />
        </button>
      ) : null}
      <h1 className="ui-header-title">{title}</h1>
      {action ? <span className="ui-header-action">{action}</span> : null}
    </header>
  );
}
