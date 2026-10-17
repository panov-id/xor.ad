import type { CSSProperties } from "react";

/** A placeholder block; the shimmer (1.3 s) is in shell.css. */
export function Skeleton({ kind = "line", style }: { kind?: "line" | "card"; style?: CSSProperties }) {
  return <div className={`skeleton skeleton-${kind}`} style={style} aria-hidden="true" />;
}
