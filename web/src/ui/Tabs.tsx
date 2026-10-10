import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { say } from "../locales/say.ts";
import { Dot } from "./Dot.tsx";

// Tabs (kit_RU.md §3.3): a `tablist` of `tab`s, each tied to its `tabpanel`.
// The name is the tab's word; a tab that holds something new says «новое» in
// its name (visually hidden) and wears the Dot, which itself speaks to nobody.
// Arrows move the choice and the focus, Tab enters on the chosen one. The
// chosen one is bold and underlined (the second channel).
export type TabItem = { id: string; label: string; fresh?: boolean; testid?: string };

export function Tabs({ label, tabs, value, onChange, panels }:
  { label: string; tabs: readonly TabItem[]; value: string; onChange: (id: string) => void; panels: Record<string, ReactNode> }) {
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = Math.max(0, tabs.findIndex((tab) => tab.id === value));
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const index = (chosen + move + tabs.length) % tabs.length;
    refs.current[index]?.focus();
    onChange(tabs[index].id);
  };
  return (
    <>
      <div role="tablist" aria-label={label} className="ui-tabs" onKeyDown={keys}>
        {tabs.map((tab, index) => (
          <button key={tab.id} ref={(node) => { refs.current[index] = node; }} type="button" role="tab" id={tabId(uid, tab.id)} aria-controls={panelId(uid, tab.id)}
            aria-selected={index === chosen} tabIndex={index === chosen ? 0 : -1} className={index === chosen ? "ui-tab ui-tab-on" : "ui-tab"} data-testid={tab.testid}
            onClick={() => onChange(tab.id)}>
            {tab.label}
            {tab.fresh ? <span className="visually-hidden"> {say("web.ui.new")}</span> : null}
            {tab.fresh ? <Dot className="ui-tab-dot" /> : null}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div key={tab.id} role="tabpanel" id={panelId(uid, tab.id)} aria-labelledby={tabId(uid, tab.id)} hidden={index !== chosen} className="ui-tabpanel">
          {panels[tab.id]}
        </div>
      ))}
    </>
  );
}

const tabId = (uid: string, id: string) => `${uid}-tab-${id}`;
const panelId = (uid: string, id: string) => `${uid}-panel-${id}`;
