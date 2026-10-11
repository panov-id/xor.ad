import { Icon, type IconName } from "./Icon.tsx";
import { Mark } from "./Mark.tsx";

// TabBar (kit_RU.md §3.3): a nav with a name; each tab is a button whose name
// is the word under its icon, aria-current=page on the open one. The channel
// besides colour is that word and the bar over the open tab (feed.css).
// New things are told in the tab's own `label` by the screen, not by a dot.
export type TabItem = { id: string; icon: IconName; label: string; current: boolean; onSelect: () => void; testid?: string };

export function TabBar({ label, items, ...rest }: { label: string; items: TabItem[]; [data: `data-${string}`]: string | undefined }) {
  return (
    <nav {...rest} className="tabbar" aria-label={label}>
      {/* the brand's mark at the rail's top, from 1024 (adaptive.css); hidden in the bar at the foot */}
      <Mark size={44} place="rail" />
      {items.map((item) => (
        <button key={item.id} type="button" className="tab" aria-current={item.current ? "page" : undefined} onClick={item.onSelect} data-testid={item.testid}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
