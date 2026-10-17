import { GRID } from "./icons";

/** A 24-grid stroke icon (shell/icons.ts). Size and stroke width come from CSS (`.icon`
 *  in shell.css: the box from the caller's class, the stroke from --stroke). */
export function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : "icon"} viewBox={`0 0 ${GRID} ${GRID}`} aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}
