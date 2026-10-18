// The frame every screen that opens from "Me" shares (sheets w4_me-edit-name … w4_age-filter): the back and the
// title on the night, the sheet under them, a primary at its foot; and the pieces they are built of — a row
// that opens something, the label/value pairs between hairlines, a coloured banner.
import type { ReactNode } from "react";
import { label, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { chevronLeft, chevronRight } from "../../shell/icons";
import { Screen } from "../../shell/Screen";

export function SubPage({ name, title, onBack, foot, children }: { name: string; title: string; onBack: () => void; foot?: ReactNode; children: ReactNode }) {
  return (
    <Screen name={name} title={title} className="me-sub">
      <header className="me-bar">
        <button type="button" className="me-back" aria-label={label("common.back")} onClick={onBack} data-testid={`${name}-back`}><Icon d={chevronLeft} /></button>
        <h1>{title}</h1>
      </header>
      <div className="me-sheet">
        <div className="me-body">{children}</div>
        {foot && <div className="me-foot">{foot}</div>}
      </div>
    </Screen>
  );
}

/** A row that opens something: an optional round icon, the name, what it holds now, the chevron. */
export function Row({ text, value, sub, icon, onOpen, testid, href }: {
  text: string; value?: string; sub?: string; icon?: string; onOpen?: () => void; testid: string; href?: string;
}) {
  const inner = (
    <>
      {icon && <span className="me-row-icon" aria-hidden="true"><Icon d={icon} /></span>}
      <span className="me-row-text"><span className="me-row-name">{text}</span>{sub && <span className="me-row-sub">{sub}</span>}</span>
      {value && <span className="me-row-value">{value}</span>}
      <Icon d={chevronRight} className="me-chev" />
    </>
  );
  if (href) return <a className="me-row" data-icon={icon ? "yes" : undefined} href={href} target="_blank" rel="noopener noreferrer" data-testid={testid}>{inner}</a>;
  return <button type="button" className="me-row" data-icon={icon ? "yes" : undefined} onClick={onOpen} data-testid={testid}>{inner}</button>;
}

/** Label and value between hairlines (w4_me-reset, w4_statements, w4_step-away). */
export function Pairs({ rows, testid }: { rows: Array<[string, string]>; testid?: string }) {
  return (
    <dl className="me-pairs" data-testid={testid}>
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

/** A coloured banner: coral for what cannot be undone or was decided, yellow for what to know. */
export function Banner({ tone, icon, title, text, testid }: { tone: "coral" | "yellow"; icon: string; title?: string; text: string; testid?: string }) {
  return (
    <div className={`me-banner me-${tone}`} data-testid={testid}>
      <Icon d={icon} />
      <div>{title && <strong>{title}</strong>}<p>{text}</p></div>
    </div>
  );
}

/** The error line under a form (the node's refusal in words). */
export const ErrorLine = ({ text }: { text: string | null }) => (text ? <p className="me-error" role="alert" data-testid="error">{text}</p> : null);

/** The node's refusal with no words of its own: its status. */
export const refusedStatus = (status: number): string => say("web.refused.status", { status });
