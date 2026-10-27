import { createContext, useContext } from "react";
import { say } from "../i18n";
import { NdIcon } from "./NdIcon";

// The bar under the feed, the talks, the tables and "Me" (sheet w4_me): four round tabs, the current one lime.
// On the desktop sheets (desktop_1440_*) the same nav is the rail at the left: the brand word, the four tabs with their
// words, «say something» (the composer, /write: onSelect("say")). tokens/wide.css shows one or the other.
// "say" is no tab of its own: the rail's button asks the shell for the composer through the same onSelect.
export type Tab = "feed" | "tables" | "chats" | "me" | "say";
// `nd`: the new design's icon of the tab (NEWDESIGN_PLAN §7 step 3; the rail of desktop-1440 / desktop-1920 sheets).
const TABS: Array<{ tab: Tab; nd: string; key: string }> = [
  { tab: "feed", nd: "nearby", key: "app.tab.feed" },
  { tab: "tables", nd: "tables", key: "app.tab.tables" },
  { tab: "chats", nd: "talks", key: "app.tab.chats" },
  { tab: "me", nd: "me", key: "app.tab.me" },
];

/** The landing's sign (sosed.place landing/icons/icon.svg): the house-speech with its antenna and six windows, in the theme's accent. */
function Sign() {
  return (
    <svg className="rail-sign" viewBox="0 0 96 96" aria-hidden="true" focusable="false">
      <circle cx="48" cy="48" r="46" fill="var(--accent)" />
      <g transform="translate(17,18) scale(0.86)" fill="var(--rail-sign-ink)">
        <path d="M48 6 V18 M42 8 L54 4" fill="none" stroke="var(--rail-sign-ink)" strokeWidth="3" strokeLinecap="round" />
        <path d="M10 18 H62 V56 H30 L18 66 V56 H10 Z" stroke="var(--rail-sign-ink)" strokeWidth="4" strokeLinejoin="round" />
        {[25, 40].flatMap((y) => [17, 32, 47].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" fill="var(--accent)" />))}
      </g>
    </svg>
  );
}
const OPEN: Tab[] = ["feed", "tables", "chats", "me"];

/** What the tabs do, given by the shell (App.tsx) so a screen with no tab bar of its own on the phone can still show the rail. */
export const TabsContext = createContext<((tab: Tab) => void) | undefined>(undefined);

/**
 * The left rail of the desktop on a screen that hides the tab bar on the phone and the tablet (the sub-pages of "Me", a talk's match,
 * the likes, a table, the new table, the departure): every desktop sheet keeps the rail (tokens/wide.css). Below the desktop it is not shown.
 */
export function Rail({ active }: { active: Tab }) {
  return <TabBar active={active} onSelect={useContext(TabsContext)} railOnly />;
}

export function TabBar({ active = "feed", onSelect, railOnly }: { active?: Tab; onSelect?: (tab: Tab) => void; railOnly?: boolean }) {
  return (
    <nav className="tabbar k-nav" aria-label={say("app.tab.main")} data-rail-only={railOnly ? "true" : undefined}>
      <span className="rail-brand" aria-hidden="true"><Sign /><span className="word">sosed</span></span>
      <span className="rail-body">
      {TABS.map(({ tab, nd, key }) => {
        const open = OPEN.includes(tab) && !!onSelect;
        return (
          <button key={tab} type="button" className="tab" aria-label={say(key)} aria-current={tab === active ? "page" : undefined}
            aria-disabled={open ? undefined : true} data-testid={`tab-${tab}`}
            // On a sub-screen (the rail only: a match's wait, a table, Me's pages) the current tab leads back to its list.
            onClick={() => { if (open && (tab !== active || railOnly)) onSelect?.(tab); }}>
            <NdIcon name={nd} className="tab-nd" /><span className="tab-word" aria-hidden="true">{say(key)}</span>
          </button>
        );
      })}
      <button type="button" className="rail-say" aria-disabled={onSelect ? undefined : true} data-testid="rail-say" onClick={() => onSelect?.("say")}>
        <NdIcon name="say-b" className="tab-nd" /><span>{say("app.rail.say")}</span>
      </button>
      <button type="button" className="rail-me" aria-label={say("app.tab.me")} aria-disabled={onSelect ? undefined : true} data-testid="rail-me"
        onClick={() => onSelect?.("me")}><NdIcon name="me" /></button>
      </span>
    </nav>
  );
}
