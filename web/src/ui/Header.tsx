import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon.tsx";
import { Mark } from "./Mark.tsx";

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
// The time of day is the theme's night pair (theme.ts), not a sky drawn here.
// The redesign (concept 15.10.2026, sheets *-feed-375/1440): the band keeps its
// 56 with the mark and a mono line (the feed and its circle); under it the
// brand's facade scene carries an overline, the place large and the step under
// it — the place is the screen's h1, the step stays the live status.
export function HeaderFeed({ place, step, action, stepProps, band, overline, scene }:
  { place: string; step: string; action?: ReactNode; stepProps?: StepProps; band?: string; overline?: string; scene?: string }) {
  return (
    <>
      <header className="ui-header">
        {/* the brand's mark, 32, below 1024; from 1024 it is at the rail's top (adaptive.css) */}
        <Mark size={32} place="header" />
        <span className="ui-header-band">{band}</span>
        {action}
      </header>
      <section className="ui-feedhero" data-testid="feed-hero">
        {scene ? <img className="ui-feedhero-scene" src={scene} alt="" aria-hidden="true" decoding="async" /> : null}
        {overline ? <p className="ui-overline">{overline}</p> : null}
        <h1 className="ui-feedhero-place">{place}</h1>
        <p className="ui-feedhero-step"><span aria-live="polite" {...stepProps}>{step}</span></p>
      </section>
    </>
  );
}

// «назад» is the screen's word (say("common.back") or its own): a back button
// comes with its label, so the kit names no word of its own (check-web-i18n).
type Back = { onBack: () => void; backLabel: string } | { onBack?: undefined; backLabel?: undefined };

// backTestid keeps a screen's own name for its back (the specs press edit-back,
// pin-back…): the back lives here, at the left, never as a wide button below.
export function HeaderScreen({ title, onBack, backLabel, action, backTestid = "back" }: { title: string; action?: ReactNode; backTestid?: string } & Back) {
  return (
    <header className="ui-header ui-header-rule">
      {onBack ? (
        <button type="button" className="ui-icon ui-icon-only" aria-label={backLabel} onClick={onBack} data-testid={backTestid}>
          <Icon name="back" />
        </button>
      ) : null}
      <h1 className="ui-header-title">{title}</h1>
      {action ? <span className="ui-header-action">{action}</span> : null}
    </header>
  );
}
