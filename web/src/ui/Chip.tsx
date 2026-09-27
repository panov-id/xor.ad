// The kit's chips (components.svg §5): 24 high at --r-pill, 14/600. A category
// chip is a 10 % tint of its colour with the colour as ink; an outline chip
// («оффер», a stale one) is a 1 px rim, no tint.
export type ChipTone = "amber" | "teal" | "violet" | "accent" | "muted";

export function Chip({ label, tone = "amber", outline = false }: { label: string; tone?: ChipTone; outline?: boolean }) {
  return <span className={["ui-chip", `ui-chip-${tone}`, outline ? "ui-chip-outline" : ""].filter(Boolean).join(" ")}>{label}</span>;
}
