// What the cabinet's prototype screens (docs/newdesign/proto/cab-*.html) share: the header panel on top (the cabinet's
// home as the app's mark with its word, the address it lives at, and the two tabs: venues and offers), the frame — the
// title and what the screen holds on one panel, the primary on the action panel under it — and the day field that shows
// "24 Oct" over a real date input.
import { type ReactNode, useId } from "react";
import { brand } from "@brand";
import { dayMonth } from "../me/me-logic";
import { LANG, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { Logo } from "../../shell/Scene";
import { Screen } from "../../shell/Screen";

/** The cabinet's public address: adv.<storefront>, never the host the page was opened on (on a stand that is an internal name). */
export const cabinetAddress = (path = ""): string => `adv.${brand.host}${path}`;

/** The two tabs of an open cabinet (cab-venues, cab-offers): the active one is on the accent. */
export type Tabs = { active: "venues" | "offers"; onVenues: () => void; onOffers: () => void };

/** The mark with its word, and the address. The mark is the cabinet's home (the venues); with no session it only stands. */
export function Strip({ onHome, current, path, tabs }: { onHome?: () => void; current?: boolean; path?: string; tabs?: Tabs }) {
  const inner = (
    <>
      <Logo size={40} />
      <span className="k-stack"><span className="k-row-name">{say("app.cabinet.venues")}</span></span>
    </>
  );
  return (
    <section className="k-panel">
      <div className="k-row">
        {onHome
          ? <button type="button" className="k-row" aria-current={current ? "page" : undefined} onClick={onHome} data-testid="cb-home">{inner}</button>
          : <div className="k-row" data-testid="cb-home">{inner}</div>}
        <span className="k-meta k-address" data-testid="cb-address">{cabinetAddress(path)}</span>
      </div>
      {tabs && (
        <div className="k-seg" role="tablist">
          <button type="button" role="tab" aria-selected={tabs.active === "venues"} aria-label={say("app.cabinet.venues_title")} onClick={tabs.onVenues}><NdIcon name="store" /></button>
          <button type="button" role="tab" aria-selected={tabs.active === "offers"} aria-label={say("app.cabinet.my_offers")} onClick={tabs.onOffers}><NdIcon name="offer" /></button>
        </div>
      )}
    </section>
  );
}

/** One cabinet screen: the header panel, then the title and what the screen holds, then the primary on the action panel. */
export function Frame({ name, title, strip, foot, scene, children }: { name: string; title: string; strip: ReactNode; foot?: ReactNode; scene?: ReactNode; children: ReactNode }) {
  return (
    <Screen name={name} title={title} className="k-screen">
      {scene}
      <div className="k-col">
        {strip}
        <section className="k-panel k-grow k-reg">
          <h1>{title}</h1>
          {children}
        </section>
        {foot && <section className="k-panel k-actions k-stack">{foot}</section>}
      </div>
    </Screen>
  );
}

/** A day as the sheet writes it ("24 Oct"), picked with the device's own date control laid transparent over it. */
export function DayField({ text, value, min, max, onChange, testid }: { text: string; value: string; min: string; max: string; onChange: (day: string) => void; testid: string }) {
  const id = useId();
  const [y, m, d] = value.split("-").map(Number);
  const shown = y && m && d ? dayMonth(LANG, new Date(y, m - 1, d, 12)) : "";
  return (
    <div className="k-field-wrap">
      <label htmlFor={id} className="k-sub">{text}</label>
      <div className="k-pill k-pill-day">
        <NdIcon name="clock" />
        <span aria-hidden="true">{shown}</span>
        <input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
      </div>
    </div>
  );
}
