import { say } from "../i18n";
import { Icon } from "./Icon";
import { chat, home, person, tables } from "./icons";

// The bar under the feed and "Me" (sheet w4_me): four round tabs, the current one lime. Chats and tables
// are not in this shell yet: their tabs are drawn and say so (aria-disabled), they open nothing.
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
      {TABS.map(({ tab, d, key }) => {
        const open = OPEN.includes(tab) && !!onSelect;
        return (
          <button key={tab} type="button" className="tab" aria-label={say(key)} aria-current={tab === active ? "page" : undefined}
            aria-disabled={open ? undefined : true} data-testid={`tab-${tab}`}
            onClick={() => { if (open && tab !== active) onSelect?.(tab); }}>
            <Icon d={d} />
          </button>
        );
      })}
    </nav>
  );
}
