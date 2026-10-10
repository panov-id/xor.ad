import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";

// Disclosure (kit_RU.md §3.2): the native <details><summary>, so Enter and
// Space, aria-expanded and the focus on the summary are the browser's own. The
// name is the summary's text; the second channel is the chevron turned right
// (closed) or down (open), by CSS, in one frame.
export function Disclosure({ summary, children, open }: { summary: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="ui-disclosure" open={open}>
      <summary><Icon name="chevron" className="ui-glyph ui-chevron" /><span>{summary}</span></summary>
      {children}
    </details>
  );
}
