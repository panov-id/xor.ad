// One badge for the whole panel. It existed three times before — brand badges in
// the waitlist, level badges in the logs, role badges in the operator list — and
// they disagreed: a brand was drawn in the colour of an error, because nothing
// said what red was for.
//
// Here the tone is the vocabulary: `info` labels, `warn` and `danger` warn, and
// `neutral` is for values that are merely values. A brand is neutral. It is not
// an incident.

import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "warn" | "danger" | "accent";

// The vocabulary lives here rather than at each call site, so a level or a role
// keeps the same colour on every page it appears on.
const LEVEL_TONES: Record<string, BadgeTone> = {
  error: "danger",
  warn: "warn",
  info: "info",
  debug: "neutral",
};

const ROLE_TONES: Record<string, BadgeTone> = {
  admin: "accent",
  tenant_admin: "info",
  moderator: "info",
  viewer: "neutral",
};

export const toneForLevel = (level: string): BadgeTone => LEVEL_TONES[level] ?? "neutral";
export const toneForRole = (role: string): BadgeTone => ROLE_TONES[role] ?? "neutral";

export const Badge = ({
  tone = "neutral",
  children,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
}) => <span className={`badge badge-${tone}`} title={title}>{children}</span>;
