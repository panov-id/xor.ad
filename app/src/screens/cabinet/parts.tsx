// What the cabinet's sheets (w4_cabinet-*) share: the strip on top (the cabinet's home and the address it lives
// at), the frame — title, body, a primary at the foot — and the day field that shows "24 Oct" over a real date input.
import { type ReactNode, useId } from "react";
import { brand } from "@brand";
import { dayMonth } from "../me/me-logic";
import { LANG, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { home } from "../../shell/icons";
import { Screen } from "../../shell/Screen";

/** The cabinet's public address: adv.<storefront>, never the host the page was opened on (on a stand that is an internal name). */
export const cabinetAddress = (path = ""): string => `adv.${brand.host}${path}`;

/** The mark with its word, and the address in mono. The mark is the cabinet's home (the venues); with no session it only stands. */
export function Strip({ onHome, current, path }: { onHome?: () => void; current?: boolean; path?: string }) {
  const inner = (
    <>
      <span className="cb-mark" aria-hidden="true"><Icon d={home} /></span>
      <span className="cb-home">{say("app.cabinet.venues")}</span>
    </>
  );
  return (
    <header className="cb-strip">
      {onHome
        ? <button type="button" className="cb-nav" aria-current={current ? "page" : undefined} onClick={onHome} data-testid="cb-home">{inner}</button>
        : <div className="cb-nav" data-testid="cb-home">{inner}</div>}
      <span className="cb-address" data-testid="cb-address">{cabinetAddress(path)}</span>
    </header>
  );
}

/** One cabinet screen: strip, then the title and what the screen holds, then the primary at the foot. */
export function Frame({ name, title, strip, foot, children }: { name: string; title: string; strip: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <Screen name={name} title={title} className="cb">
      {strip}
      <div className="cb-body">
        <h1 className="cb-title">{title}</h1>
        {children}
      </div>
      {foot && <div className="cb-foot">{foot}</div>}
    </Screen>
  );
}

/** A day as the sheet writes it ("24 Oct"), picked with the device's own date control laid transparent over it. */
export function DayField({ text, value, min, max, onChange, testid }: { text: string; value: string; min: string; max: string; onChange: (day: string) => void; testid: string }) {
  const id = useId();
  const [y, m, d] = value.split("-").map(Number);
  const shown = y && m && d ? dayMonth(LANG, new Date(y, m - 1, d, 12)) : "";
  return (
    <div className="reg-field cb-day">
      <label htmlFor={id}>{text}</label>
      <div className="cb-day-box">
        <span className="reg-input" aria-hidden="true">{shown}</span>
        <input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
      </div>
    </div>
  );
}
