import { say } from "../i18n";
import { Icon } from "./Icon";
import { chat, home, person, plus, tables } from "./icons";

// The bar under the feed and "Me" (sheet w4_me): four round tabs, the current one lime. Chats and tables
// are not in this shell yet: their tabs are drawn and say so (aria-disabled), they open nothing.
// On the desktop sheets (desktop_1440_*) the same nav is the rail at the left: the brand word, the four tabs with their
// words, «say something» (the composer is not in this shell: drawn, aria-disabled). tokens/wide.css shows one or the other.
export type Tab = "feed" | "tables" | "chats" | "me";
const TABS: Array<{ tab: Tab; d: string; key: string }> = [
  { tab: "feed", d: home, key: "app.tab.feed" },
  { tab: "tables", d: tables, key: "app.tab.tables" },
  { tab: "chats", d: chat, key: "app.tab.chats" },
  { tab: "me", d: person, key: "app.tab.me" },
];
const OPEN: Tab[] = ["feed", "me"];

export function TabBar({ active = "feed", onSelect }: { active?: Tab; onSelect?: (tab: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label={say("app.tab.main")}>
      <span className="rail-brand word" aria-hidden="true">sosed</span>
      {TABS.map(({ tab, d, key }) => {
        const open = OPEN.includes(tab) && !!onSelect;
        return (
          <button key={tab} type="button" className="tab" aria-label={say(key)} aria-current={tab === active ? "page" : undefined}
            aria-disabled={open ? undefined : true} data-testid={`tab-${tab}`}
            onClick={() => { if (open && tab !== active) onSelect?.(tab); }}>
            <Icon d={d} /><span className="tab-word" aria-hidden="true">{say(key)}</span>
          </button>
        );
      })}
      <button type="button" className="rail-say" aria-disabled="true" data-testid="rail-say"><Icon d={plus} /><span>{say("app.rail.say")}</span></button>
    </nav>
  );
}
