import type { ButtonHTMLAttributes } from "react";

// The kit's buttons (components.svg §2): primary, secondary, danger are 44 tall
// at --r-2; pill is the light spark pill at --r-pill; text is a word action with
// a 44 zone. A disabled primary stays visible (Н1): panel-2 with muted ink, and
// the reason in words under it.
export type ButtonKind = "primary" | "secondary" | "danger" | "pill" | "text";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; reason?: string };

export function Button({ kind = "secondary", reason, className, disabled, ...rest }: Props) {
  const button = <button {...rest} disabled={disabled} className={["ui-button", `ui-${kind}`, className].filter(Boolean).join(" ")} />;
  if (!disabled || !reason) return button;
  return (
    <span className="ui-button-reason">
      {button}
      <span className="muted">{reason}</span>
    </span>
  );
}
