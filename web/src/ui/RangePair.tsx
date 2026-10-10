import { useId } from "react";
import { say } from "../locales/say.ts";
import { ErrorLine } from "./ErrorLine.tsx";

// RangePair (kit_RU.md §3.2): two native `range` inputs named «от» and «до»;
// arrows step; aria-valuetext says the value in words («от 25 лет»). The value
// is also written beside the slider, and the edge says «без ограничения» (on
// «от» the low edge, on «до» the high one). «От» above «до» is an error:
// both sliders aria-invalid, the word «ошибка:» below. Unavailable keeps focus
// and ignores the change; the reason is beside it.
type Props = {
  min: number;
  max: number;
  step?: number;
  from: number;
  to: number;
  onChange: (range: { from: number; to: number }) => void;
  /** A number as words («25 лет»): the unit is the caller's, through Intl. */
  format?: (n: number) => string;
  fromLabel?: string;
  toLabel?: string;
  disabled?: boolean;
  reason?: string;
};

export function RangePair({ min, max, step = 1, from, to, onChange, format = (n) => String(n), fromLabel = say("web.filter.from"), toLabel = say("web.filter.to"), disabled, reason }: Props) {
  const uid = useId();
  const ids = { from: `${uid}-a`, to: `${uid}-b`, error: `${uid}-e`, reason: `${uid}-r` };
  const bad = from > to;
  const described = [disabled && reason ? ids.reason : "", bad ? ids.error : ""].filter(Boolean).join(" ") || undefined;
  const common = { type: "range" as const, min, max, step, "aria-describedby": described, "aria-invalid": bad ? (true as const) : undefined,
    "aria-errormessage": bad ? ids.error : undefined, "aria-disabled": disabled ? (true as const) : undefined };
  const words = (n: number, edge: number) => (n === edge ? say("web.filter.noLimit") : format(n));
  return (
    <div className="ui-field">
      <div className="ui-range">
        <label htmlFor={ids.from}>{fromLabel}</label>
        <input {...common} id={ids.from} className="ui-input" value={from} aria-valuetext={spoken(from, min, "web.ui.rangeFrom", format)}
          onChange={(event) => { if (!disabled) onChange({ from: Number(event.target.value), to }); }} />
        <span className="ui-range-value" aria-hidden="true">{words(from, min)}</span>
      </div>
      <div className="ui-range">
        <label htmlFor={ids.to}>{toLabel}</label>
        <input {...common} id={ids.to} className="ui-input" value={to} aria-valuetext={spoken(to, max, "web.ui.rangeTo", format)}
          onChange={(event) => { if (!disabled) onChange({ from, to: Number(event.target.value) }); }} />
        <span className="ui-range-value" aria-hidden="true">{words(to, max)}</span>
      </div>
      {disabled && reason ? <p id={ids.reason} className="ui-reason">{reason}</p> : null}
      {bad ? <ErrorLine id={ids.error}>{say("web.ui.rangeOrder")}</ErrorLine> : null}
    </div>
  );
}

// «от 25 лет», or «без ограничения» at the open edge.
function spoken(value: number, edge: number, key: string, format: (n: number) => string): string {
  return value === edge ? say("web.filter.noLimit") : say(key, { n: format(value) });
}
