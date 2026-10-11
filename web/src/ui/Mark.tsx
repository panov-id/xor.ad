import { useLayoutEffect, useRef, useState } from "react";
import { BRAND } from "../config.ts";

// The brand's own mark (owner 11.10.2026: «use the logos we drew for the brands, accent on them»;
// quorum: the hero of the splash, 32 in the header, 44 at the rail's top; never in the tab bar or chat).
// Drawn after the landings': sosed — repo sosed.place landing/index.html:319, a speech bubble that is a
// block of flats, 2×3 windows, an antenna, in an accent circle; neighbro — repo neighbro.place
// landing/icons/icon.svg, a speech bubble shaped as a house with a chimney, here as a die-cut sticker.
// It follows the theme's accent; where the accent is under 3:1 on the ground (sosed amber 2.2,
// turquoise 2.3; neighbro light and mono 2.1 — scripts/design/adaptive-sheets.py) it takes accent-text.
// Sheets: panel/design/adaptive-*.svg.

function lum(rgb: string): number {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m) return 0;
  const [r, g, b] = m.slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// The accent as a colour the browser resolved, against the ground behind the mark.
function useFaint(ref: React.RefObject<SVGSVGElement | null>): boolean {
  const [faint, setFaint] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const probe = (v: string) => { const s = document.createElement("span"); s.style.color = `var(${v})`; el.parentElement!.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; };
    setFaint(ratio(probe("--accent"), probe("--bg")) < 3);
  }, [ref]);
  return faint;
}

export function Mark({ size, place }: { size: number; place: "splash" | "rail" | "header" | "form" }) {
  const ref = useRef<SVGSVGElement>(null);
  const faint = useFaint(ref);
  const fill = faint ? "var(--accent-text)" : "var(--accent)";
  if (BRAND === "neighbro") {
    const house = "M36 4 L64 28 V57 H32 L20 67 V57 H8 V28 Z";
    return (
      <svg ref={ref} className="ui-mark" data-place={place} data-mark="neighbro" data-faint={faint || undefined} width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
        <g transform="translate(6 3) scale(1.05)">
          <g transform="translate(1.5 3)" fill="var(--shadow)" stroke="var(--shadow)" strokeLinejoin="round">
            <rect x="50" y="10" width="7" height="14" rx="2" strokeWidth="10" />
            <path d={house} strokeWidth="14" />
          </g>
          <rect x="50" y="10" width="7" height="14" rx="2" fill={fill} stroke="var(--surface)" strokeWidth="7" paintOrder="stroke" />
          <path d={house} fill={fill} stroke="var(--surface)" strokeWidth="9" strokeLinejoin="round" paintOrder="stroke" />
          <rect x="22" y="32" width="18" height="5" rx="2.5" fill="var(--surface)" />
          <rect x="22" y="43" width="27" height="5" rx="2.5" fill="var(--surface)" />
        </g>
      </svg>
    );
  }
  return (
    <svg ref={ref} className="ui-mark" data-place={place} data-mark="sosed" data-faint={faint || undefined} width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" fill="var(--accent)" stroke={faint ? "var(--accent-text)" : "none"} strokeWidth="3" />
      <g transform="translate(17 18) scale(0.86)">
        <path d="M48 6 V18 M42 8 L54 4" fill="none" stroke="var(--accent-fg)" strokeWidth="3" strokeLinecap="round" />
        <path d="M10 18 H62 V56 H30 L18 66 V56 H10 Z" fill="var(--accent-fg)" stroke="var(--accent-fg)" strokeWidth="4" strokeLinejoin="round" />
        {[[17, 25], [32, 25], [47, 25], [17, 40], [32, 40], [47, 40]].map(([x, y], i) => (
          <rect key={i} data-window={i} x={x} y={y} width="8" height="8" fill="var(--accent)" />
        ))}
      </g>
    </svg>
  );
}
