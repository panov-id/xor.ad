// The frame every screen that opens from "Me" shares, as the prototype draws its sub-screens (forget-confirm.html,
// restore.html, me-*.html): the bar with back and the title in its pill, the panel, the action panel at the foot; and
// the pieces they are built of — a row that opens something, label/value pairs, a note.
import type { ReactNode } from "react";
import { label, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { NdIcon } from "../../shell/NdIcon";
import { Rail } from "../../shell/TabBar";

/** `head` stands between the bar and the panel (reissue's "step n of 2"); `backTestid` the web's name for the back. */
export function SubPage({ name, title, onBack, foot, head, backTestid, children }: { name: string; title: string; onBack: () => void; foot?: ReactNode; head?: ReactNode; backTestid?: string; children: ReactNode }) {
  return (
    <main className="k-screen" data-screen={name}>
      <div className="k-col">
        <header className="k-row k-bar">
          <button type="button" className="k-bar-btn" aria-label={label("common.back")} onClick={onBack} data-testid={backTestid ?? `${name}-back`}><NdIcon name="back" /></button>
          <h1 className="k-bar-title">{title}</h1>
        </header>
        {head}
        <section className="k-panel k-grow k-reg">{children}</section>
        {foot && <section className="k-panel k-actions k-stack">{foot}</section>}
      </div>
      <Rail active="me" />
    </main>
  );
}

/** A row that opens something: an optional round icon, the name, what it holds now, the chevron. */
export function Row({ text, value, sub, icon, onOpen, testid, href }: {
  text: string; value?: string; sub?: string; icon?: string; onOpen?: () => void; testid: string; href?: string;
}) {
  const inner = (
    <>
      {icon && <span className="k-badge k-badge-row" data-c="1" aria-hidden="true"><Icon d={icon} /></span>}
      <span className="k-stack k-row-text"><span className="k-row-name">{text}</span>{sub && <span className="k-meta">{sub}</span>}</span>
      {value && <span className="k-meta k-row-value">{value}</span>}
      <NdIcon name="chev" className="k-chev" />
    </>
  );
  if (href) return <a className="k-link-row" data-icon={icon ? "yes" : undefined} href={href} target="_blank" rel="noopener noreferrer" data-testid={testid}>{inner}</a>;
  return <button type="button" className="k-link-row" data-icon={icon ? "yes" : undefined} onClick={onOpen} data-testid={testid}>{inner}</button>;
}

/** Label and value between hairlines (w4_me-reset, w4_statements, w4_step-away). A "prose" row is free text from the
 *  node (a statement's facts and grounds): it wraps and grows, read whole, never cut to one line. */
export function Pairs({ rows, testid }: { rows: Array<[string, string] | [string, string, "prose"]>; testid?: string }) {
  return (
    <dl className="k-pairs" data-testid={testid}>
      {rows.map(([k, v, kind]) => <div key={k} data-prose={kind === "prose" ? "" : undefined}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

/** A coloured banner: coral for what cannot be undone or was decided, yellow for what to know. */
export function Banner({ tone, icon, title, text, testid }: { tone: "coral" | "yellow"; icon: string; title?: string; text: string; testid?: string }) {
  return (
    <div className="k-note" data-tone={tone === "coral" ? "error" : undefined} data-testid={testid}>
      <Icon d={icon} />
      <div>{title && <strong>{title}</strong>}<p>{text}</p></div>
    </div>
  );
}

/** The error line under a form (the node's refusal in words). */
export const ErrorLine = ({ text }: { text: string | null }) => (text ? <p className="k-note" data-tone="error" role="alert" data-testid="error">{text}</p> : null);

/** The node's refusal with no words of its own: its status. */
export const refusedStatus = (status: number): string => say("web.refused.status", { status });
