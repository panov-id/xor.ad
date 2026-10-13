// A quiet action drawn as a link (styles.css .ui-link): for a way that is not one of a screen's
// main buttons, e.g. «arrive» under the splash's two ways in (owner 12.10.2026).
import type { ButtonHTMLAttributes } from "react";

export function TextButton({ block = false, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { block?: boolean; [data: `data-${string}`]: string | undefined }) {
  return <button type="button" {...rest} className={["ui-link", block ? "ui-link-block" : "", className].filter(Boolean).join(" ")} />;
}
