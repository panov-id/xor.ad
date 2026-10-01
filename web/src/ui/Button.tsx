import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon.tsx";

// The kit's buttons (components.svg §2, comic 2026-10-01): primary, secondary,
// danger are 44 tall with an ink outline and the hard 6/6 shadow; pill is the
// spark pill; text is a word action with a 44 zone. A disabled primary stays
// visible (Н1): panel-2 with muted ink, and the reason in words under it.
// Icon-only (comic): a 44×44 button holding one Icon and no words — its name
// is the aria-label, required, taken from the key that used to be its text.
export type ButtonKind = "primary" | "secondary" | "danger" | "pill" | "text";

type Common = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; reason?: string };
type Props = (Common & { icon?: undefined }) | (Common & { icon: IconName; "aria-label": string; children?: never });

export function Button({ kind = "secondary", reason, className, disabled, icon, children, ...rest }: Props) {
  const classes = ["ui-button", `ui-${kind}`, icon ? "ui-icon-only" : "", className].filter(Boolean).join(" ");
  const button = (
    <button {...rest} disabled={disabled} className={classes}>
      {icon ? <Icon name={icon} /> : children}
    </button>
  );
  if (!disabled || !reason) return button;
  return (
    <span className="ui-button-reason">
      {button}
      <span className="muted">{reason}</span>
    </span>
  );
}
