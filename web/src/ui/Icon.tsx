// The comic's icons, no stars (owner 2026-10-01) (web/design/comic-2026-10-01.svg, «ИКОНКИ · 18 ДЕЙСТВИЙ»):
// a 2.4 outline on a 24 grid, round joins, in currentColor; a closed shape
// (class "f") is filled with --icon-fill, flat, transparent unless the button
// sets it. An icon never speaks: the button around it carries the aria-label.
import type { CSSProperties, SVGAttributes } from "react";
import { BRAND } from "../config.ts";

// The like is the storefront's own mark, as an outline (owner 11.10.2026: «no heart; the logo, simply,
// as thick as the letters»; sheets panel/design/adaptive-*-like.svg). sosed: the speech bubble that is a
// block of flats, with its antenna; its six windows are the fill — lit when the like is given.
// neighbro: the house-shaped bubble with its chimney; its two lines are the fill. The viewer's
// storefront decides, never the author's (docs/chat_RU.md §8: the brand is a face, not a boundary).
const LIKE_SOSED = (
  <>
    <path d="M3.5 7.5 H20.5 V18 H10.5 L6.5 21.5 V18 H3.5 Z" />
    <path d="M15.5 7.5 V3.5 M13.5 4 L17.5 3" />
    {/* n = the window's order, row by row: the like lights them 60 ms apart (adaptive.css) */}
    {[10, 13.75].flatMap((y, row) => [6.25, 10.75, 15.25].map((x, col) => {
      const n = row * 3 + col;
      return <rect key={n} className="f" data-window={n} style={{ "--n": n } as CSSProperties} x={x} y={y} width="2.5" height="2.25" rx="0.4" />;
    }))}
  </>
);
const LIKE_NEIGHBRO = (
  <>
    <path d="M12 3 L20 9.5 V18 H11 L7 21.5 V18 H4 V9.5 Z" />
    <path d="M16 6.25 V3.5 H18 V7.9" />
    <rect className="f" data-window="0" style={{ "--n": 0 } as CSSProperties} x="8" y="11.25" width="5.5" height="1.5" rx="0.75" />
    <rect className="f" data-window="1" style={{ "--n": 1 } as CSSProperties} x="8" y="14.25" width="8.5" height="1.5" rx="0.75" />
  </>
);

const PATHS = {
  back: <path d="M15 5 L8 12 L15 19" />,
  like: BRAND === "neighbro" ? LIKE_NEIGHBRO : LIKE_SOSED,
  // How many are going (a phrase's mode; sheets adaptive-*-feed): «me» alone, these two the others.
  company: <><circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M3.5 19.5 C4 15 14 15 14.5 19.5 M14 15 C17.5 14.5 20.5 16 20.5 19" /></>,
  party: <><path d="M4 20 L8.5 8 L16 15.5Z" /><path d="M13 4 V6 M18 6 L16.5 7.5 M20 11 H18 M11 9 L13 7" /></>,
  hide: <><path className="f" d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12Z" /><circle cx="12" cy="12" r="3" /><path d="M4 20 L20 4" /></>,
  block: <><circle className="f" cx="12" cy="12" r="9" /><path d="M5.6 5.6 L18.4 18.4" /></>,
  write: <><path className="f" d="M4 20 L5 15 L16 4 L20 8 L9 19Z" /><path d="M14 6 L18 10" /></>,
  new: <path d="M12 5 V19 M5 12 H19" />,
  likes: BRAND === "neighbro" ? LIKE_NEIGHBRO : LIKE_SOSED,   // «my likes»: the same mark (owner 11.10.2026)
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
  timer: <><circle className="f" cx="12" cy="13" r="8" /><path d="M12 9 V13 L15 15 M9 2 H15" /></>,
  check: <path d="M4 12 L10 18 L20 6" />,
  arrive: <><rect className="f" x="12" y="3" width="9" height="18" rx="2" /><path d="M2 12 H14 M10 8 L14 12 L10 16" /></>,
  queue: <><rect className="f" x="4" y="4" width="16" height="5" /><rect className="f" x="4" y="11" width="11" height="5" /><path d="M4 20 H11 M15 18 L19 20 L15 22" /></>,
  code: <><rect className="f" x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10 V14 M10 10 V14 M13 10 V14 M16 10 V14" /></>,
  reset: <><path className="f" d="M5 7 H19 L18 21 H6Z" /><path d="M3 7 H21 M9 7 V4 H15 V7 M10 11 V17 M14 11 V17" /></>,
  forget: <><rect className="f" x="6" y="2" width="12" height="20" rx="2" /><path d="M9 9 L15 15 M15 9 L9 15" /></>,
  giveup: <><path className="f" d="M6 4 C10 2 13 6 19 4 V12 C13 14 10 10 6 12Z" /><path d="M6 21 V3" /></>,
  pass: <><path className="f" d="M4 5 L13 12 L4 19Z" /><path d="M18 5 V19" /></>,
  unblock: <><rect className="f" x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11 V7 A4 4 0 0 1 16 6" /></>,
  link: <><path d="M9 15 L15 9" /><path d="M8 11 L5 14 A3.5 3.5 0 0 0 10 19 L13 16" /><path d="M16 13 L19 10 A3.5 3.5 0 0 0 14 5 L11 8" /></>,
  mail: <><rect className="f" x="3" y="6" width="18" height="13" rx="1" /><path d="M3 7 L12 13 L21 7" /></>,
  pin: <><path className="f" d="M12 22 C7 15 5 12 5 9 A7 7 0 0 1 19 9 C19 12 17 15 12 22Z" /><circle cx="12" cy="9" r="2.5" /></>,
  close: <path d="M6 6 L18 18 M18 6 L6 18" />,
  eye: <><path className="f" d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  table: <><path className="f" d="M3 8 H21 V11 H3Z" /><path d="M6 11 V19 M18 11 V19 M5 15 H19" /></>,
  feed: <path d="M4 6 H20 M4 12 H20 M4 18 H20" />,
  me: <><circle className="f" cx="12" cy="8" r="4" /><path className="f" d="M4 21 C4 15 20 15 20 21Z" /></>,
  later: <><path className="f" d="M6 3 H18 C18 9 13 10 12 12 C11 10 6 9 6 3Z" /><path className="f" d="M6 21 H18 C18 15 13 14 12 12 C11 14 6 15 6 21Z" /></>,
  venue: <><path className="f" d="M3 9 L5 4 H19 L21 9Z" /><path className="f" d="M5 9 V20 H19 V9" /><path d="M10 20 V14 H14 V20" /></>,
  offers: <><path className="f" d="M3 12 V4 H11 L21 14 L13 22Z" /><circle cx="7.5" cy="8" r="1.5" /></>,
  name: <><circle className="f" cx="12" cy="8" r="4" /><path className="f" d="M4 21 C4 15 20 15 20 21Z" /></>,
  chevron: <path d="M9 5 L16 12 L9 19" />,
  // The inbox (the way back to the conversations list), a tray with its notch: not the speech bubble, which is «say».
  inbox: <><path className="f" d="M3 13 L6 5 H18 L21 13 V19 H3Z" /><path d="M3 13 H8 L9.5 16 H14.5 L16 13 H21" /></>,
  // «again» (a rematch): the arrow runs round against the clock; «refresh» runs with it.
  rematch: <><path d="M4 12 A8 8 0 1 0 6.3 6.3" /><path d="M4 4 V9 H9" /></>,
  // «show more» (the next page of a list): two chevrons down; «more» is the three dots of a sheet.
  expand: <path d="M6 6 L12 12 L18 6 M6 13 L12 19 L18 13" />,
  // The foot of a tile (TileFoot): who plays, a free seat. Watching is `eye`.
  player: <><circle className="f" cx="12" cy="6.5" r="3" /><path className="f" d="M9.5 21 C9.5 16 11 14 10 11.5 H14 C13 14 14.5 16 14.5 21Z" /></>,
  seat: <><path className="f" d="M7 3 H15 V13 H7Z" /><path d="M5 13 H17 V16 H5Z M7 16 V21 M15 16 V21" /></>,
  more: <g className="dot"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></g>,
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
