import type { ReactNode } from "react";
import { Button } from "./Button.tsx";
import { Select, type SelectOption } from "./Select.tsx";

// PlaceBar (strict review 11.10, «weld the adjacent»): the place and the radius are one task — «where, how
// far» — so they stand in ONE capsule: the pin that opens the place picker, a 1px seam, the radius select.
// One outline, radius h/2 (styles.css .ui-placebar). The feed and the empty feed draw the same bar. The
// words are the caller's (say(…) keys): the kit names none of its own.
export function PlaceBar({ placeLabel, onPlace, radiusLabel, options, value, onChange, children, ...rest }: {
  placeLabel: string;
  // Without it the bar holds the radius alone (no place to change).
  onPlace?: () => void;
  radiusLabel: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
} & { [data: `data-${string}`]: string | undefined }) {
  return (
    <span {...rest} className="ui-placebar" data-testid="radius">
      {onPlace && (
        <>
          <Button type="button" icon="pin" aria-label={placeLabel} onClick={onPlace} data-testid="place" />
          <span className="ui-placebar-seam" aria-hidden="true" />
        </>
      )}
      <span className="ui-placebar-radius">
        <Select label={radiusLabel} options={options} value={value} onChange={onChange} />
      </span>
      {children}
    </span>
  );
}
