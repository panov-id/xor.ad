import type { ReactNode } from "react";

// Pair (kit_RU.md §3.3): a label and its value as a `dl` — the label is a word
// in a `dt`, the value its `dd`, so the pair is read as «подпись: значение»
// and the label is not only a muted colour. A group of pairs is one `dl`.
export function Pairs({ children, ...rest }: { children: ReactNode; [data: `data-${string}`]: string | undefined }) {
  return <dl {...rest} className="ui-pairs">{children}</dl>;
}

export function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ui-pair">
      <dt className="ui-pair-label">{label}</dt>
      <dd className="ui-pair-value">{children}</dd>
    </div>
  );
}
