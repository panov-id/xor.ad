import type { AnchorHTMLAttributes, HTMLAttributes } from "react";
import { say } from "../locales/say.ts";

// LinkButton, Link, Actions (kit_RU.md §3.1).
type Anchor = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel" | "className"> & { href: string };

// LinkButton: a link that looks like a Button; role link, Enter. Name = its words.
export function LinkButton({ kind = "secondary", children, ...rest }: Anchor & { kind?: "primary" | "secondary" }) {
  return <a {...rest} className={`ui-button ui-${kind}`}>{children}</a>;
}

// Link: the theme's accent-text, always underlined (the second channel). An
// external one opens a new tab and says so in its name. In running text it is
// the 2.5.8 exception; `block` makes it a 44 target of its own.
export function Link({ external = false, block = false, children, ...rest }: Anchor & { external?: boolean; block?: boolean }) {
  return (
    <a {...rest} className={block ? "ui-link ui-link-block" : "ui-link"} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
      {children}
      {external ? <span className="visually-hidden"> {say("web.ui.newTab")}</span> : null}
    </a>
  );
}

// Actions: a `group` with no name; the DOM order is «quiet to loud», the
// primary last, and the row wraps instead of scrolling.
export function Actions({ children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} role="group" className="ui-actions">{children}</div>;
}
