import { createContext, useContext } from "react";
import { say } from "../i18n";
import { NavLaptop } from "../nd4/nav-laptop.gen";
import { NavPhone } from "../nd4/nav-phone.gen";
import { NavTablet } from "../nd4/nav-tablet.gen";
import { useMinWidth } from "./useMinWidth";

// The bar under the feed, the talks, the tables and "Me" (sheet w4_me): four round tabs, the current one lime.
// On the desktop sheets (desktop_1440_*) the same nav is the rail at the left: the brand word, the four tabs with their
// words, «say something» (the composer, /write: onSelect("say")). tokens/wide.css shows one or the other.
// "say" is no tab of its own: the rail's button asks the shell for the composer through the same onSelect.
export type Tab = "feed" | "tables" | "chats" | "me" | "say";
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

/**
 * The tablet's rail (docs/newdesign4 kypros-tablet.html, 260 of its 283 screens): the archive's nav as is (nd4/nav-tablet.gen.tsx),
 * beside a screen drawn whole from the tablet file (its frame: tokens/nd4-kit.css main.nd-screen[data-width="tablet"]).
 * The tablet screens not yet taken from the archive keep their own bar.
 */
export function RailTablet({ active }: { active: Tab }) {
  const onSelect = useContext(TabsContext);
  const pick = (tab: Tab) => { if (tab === "say" || OPEN.includes(tab)) onSelect?.(tab); };
  return (
    <div className="nd-nav-tablet">
      <NavTablet active={active} onSelect={pick} label={say("app.tab.main")} sayText={say("app.rail.say")}
        labels={{ feed: say("app.tab.feed"), tables: say("app.tab.tables"), chats: say("app.tab.chats"), me: say("app.tab.me") }} />
    </div>
  );
}

export function TabBar({ active = "feed", onSelect, railOnly }: { active?: Tab; onSelect?: (tab: Tab) => void; railOnly?: boolean }) {
  // the laptop (docs/newdesign4 kypros-laptop.html, 250 of its app screens): the archive's nav as is (nd4/nav-laptop.gen.tsx);
  // the wrapper keeps the rail's place in the layout (tokens/wide.css .tabbar, sized in tokens/nd4-kit.css); no k-nav:
  // tokens/kit.css .k-nav > * would size the nav as a phone tab
  const desk = useMinWidth("--bp-desktop");
  if (desk) {
    const pick = (tab: Tab) => { if (tab === "say" || (OPEN.includes(tab) && (tab !== active || railOnly))) onSelect?.(tab); };
    return (
      <div className="tabbar nd-nav-laptop" data-rail-only={railOnly ? "true" : undefined}>
        <NavLaptop active={active} onSelect={pick} label={say("app.tab.main")} sayText={say("app.rail.say")}
          labels={{ feed: say("app.tab.feed"), tables: say("app.tab.tables"), chats: say("app.tab.chats"), me: say("app.tab.me") }} />
      </div>
    );
  }
  // the phone (and the tablet screens not yet drawn from the archive): the archive's bar as is (nd4/nav-phone.gen.tsx);
  // on a sub-screen (the rail only: a match's wait, a table, Me's pages) the current tab leads back to its list
  const pick = (tab: Tab) => { if (OPEN.includes(tab) && (tab !== active || railOnly)) onSelect?.(tab); };
  return (
    <div className="tabbar nd-nav-phone" data-rail-only={railOnly ? "true" : undefined}>
      <NavPhone active={active} onSelect={pick} label={say("app.tab.main")}
        labels={{ feed: say("app.tab.feed"), tables: say("app.tab.tables"), chats: say("app.tab.chats"), me: say("app.tab.me") }} />
    </div>
  );
}
