// The new design's icons («Двор» family: grid 48, stroke 4.5, round caps, one colour plus a soft fill --ifill), drawn
// from nd-icons.gen.ts, and the chip that carries one (NEWDESIGN_PLAN §4): a square big × 1.45, rounded big × 0.42, the
// icon's own accent behind it (--acc-N, the same on every screen), the icon white with a 28 % white fill.
import type { CSSProperties } from "react";
import { ND_ICONS } from "./nd-icons.gen";
import { PROTO_ICONS } from "./proto-icons.gen";

export function NdIcon({ name, className }: { name: string; className?: string }) {
  // the prototype's shape first (proto-icons.gen.ts: the screens are the source of truth); the archive's icons/svg only
  // for a name no screen of the prototype draws
  const proto = PROTO_ICONS[name];
  if (proto !== undefined) {
    return (
      <svg className={className ? `nd-icon ${className}` : "nd-icon"} viewBox="0 0 48 48" fill="none" stroke="currentColor"
        strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon={name}
        dangerouslySetInnerHTML={{ __html: proto }} />
    );
  }
  const icon = ND_ICONS[name];
  if (!icon) return null;
  return (
    <svg className={className ? `nd-icon ${className}` : "nd-icon"} viewBox="0 0 48 48" fill="none" stroke="currentColor"
      strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-icon={name}>
      {icon.els.map(([Tag, a], k) => <Tag key={k} {...a} />)}
    </svg>
  );
}

/** `big`: the icon's size in px; the chip is 1.45 of it. An icon with no accent of its own takes the theme's. */
export function Chip({ name, big = 24, className }: { name: string; big?: number; className?: string }) {
  const accent = ND_ICONS[name]?.accent;
  const style = { "--chip-n": big, "--chip-bg": accent ? `var(--acc-${accent})` : "var(--accent)" } as CSSProperties;
  return (
    <span className={className ? `nd-chip ${className}` : "nd-chip"} style={style} data-chip={name}>
      <NdIcon name={name} />
    </span>
  );
}
