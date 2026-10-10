import { useId, type ReactNode } from "react";

// Illustration (kit_RU.md §3.3): a picture is either decoration — aria-hidden,
// no name — or a scheme that carries meaning: role=img named by its <title>
// (a key of the dictionary, passed in). `children` are the SVG shapes, drawn in
// currentColor and the tokens.
export function Illustration({ title, viewBox, size = 96, height = size, children, ...rest }:
  { title?: string; viewBox: string; size?: number; height?: number; children: ReactNode } & { [data: `data-${string}`]: string | undefined }) {
  const id = useId();
  const common = { ...rest, viewBox, width: size, height, className: "ui-illustration", focusable: "false" as const };
  if (!title) return <svg {...common} aria-hidden="true">{children}</svg>;
  return (
    <svg {...common} role="img" aria-labelledby={id}>
      <title id={id}>{title}</title>
      {children}
    </svg>
  );
}
