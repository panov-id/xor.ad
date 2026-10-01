// The comic's icons, no stars (owner 2026-10-01) (web/design/comic-2026-10-01.svg, «ИКОНКИ · 18 ДЕЙСТВИЙ»):
// a 2.4 outline on a 24 grid, round joins, in currentColor; a closed shape
// (class "f") is filled with --icon-fill, flat, transparent unless the button
// sets it. An icon never speaks: the button around it carries the aria-label.
import type { SVGAttributes } from "react";

const HEART = "M12 20.5 C5.5 16 3 12.6 3 9 A4.6 4.6 0 0 1 12 7 A4.6 4.6 0 0 1 21 9 C21 12.6 18.5 16 12 20.5Z";

const PATHS = {
  back: <path d="M15 5 L8 12 L15 19" />,
  like: <path className="f" d={HEART} />,
  hide: <><path className="f" d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12Z" /><circle cx="12" cy="12" r="3" /><path d="M4 20 L20 4" /></>,
  block: <><circle className="f" cx="12" cy="12" r="9" /><path d="M5.6 5.6 L18.4 18.4" /></>,
  write: <><path className="f" d="M4 20 L5 15 L16 4 L20 8 L9 19Z" /><path d="M14 6 L18 10" /></>,
  new: <path d="M12 5 V19 M5 12 H19" />,
  likes: <><circle className="f" cx="12" cy="12" r="10" /><path transform="translate(6 6.4) scale(.5)" d={HEART} /></>,
  send: <><path className="f" d="M4 12 L20 4 L14 20 L11 13Z" /><path d="M11 13 L20 4" /></>,
  end: <path className="f" d="M5 15 C8 11 16 11 19 15 L17 17 L14 15.5 V13.5 C12.7 13.2 11.3 13.2 10 13.5 V15.5 L7 17Z" />,
  key: <><circle className="f" cx="8" cy="12" r="4" /><path d="M12 12 H21 M18 12 V15 M21 12 V14" /></>,
  consent: <><path className="f" d="M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6Z" /><path d="M9 12 L11 14 L15 10" /></>,
  random: <><rect className="f" x="4" y="4" width="16" height="16" rx="3" /><g className="dot"><circle cx="9" cy="9" r="1" /><circle cx="15" cy="15" r="1" /><circle cx="15" cy="9" r="1" /><circle cx="9" cy="15" r="1" /></g></>,
  watch: <path className="f" d="M8 5 L19 12 L8 19Z" />,
  report: <><path className="f" d="M5 4 H17 L14 8.5 L17 13 H5Z" /><path d="M5 21 V4" /></>,
  leave: <><path d="M10 4 H5 V20 H10" /><path d="M14 8 L18 12 L14 16 M18 12 H9" /></>,
  refresh: <><path d="M20 12 A8 8 0 1 1 17.7 6.3" /><path d="M20 4 V9 H15" /></>,
  open: <path d="M5 12 H18 M13 7 L18 12 L13 17" />,
  say: <path className="f" d="M4 5 H20 V16 H10 L5 20 V16 H4Z" />,
  info: <><circle className="f" cx="12" cy="12" r="9" /><path d="M12 11 V17" /><g className="dot"><circle cx="12" cy="7.5" r="1.2" /></g></>,
} as const;

export type IconName = keyof typeof PATHS;
export const ICONS = Object.keys(PATHS) as IconName[];

export function Icon({ name, size = 24, ...rest }: { name: IconName; size?: number } & SVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" className="ui-glyph" data-icon={name} {...rest}>
      {PATHS[name]}
    </svg>
  );
}
