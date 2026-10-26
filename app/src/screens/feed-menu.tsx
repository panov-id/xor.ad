// The feed's menu (w1_feed: the icon at the top left of the header) as a bottom sheet, like the card's «…»: the ways out of the
// feed that the web's header has beside the circle — the likes I gave (web Feed.tsx `likes`) and a new table (`new-table`).
// The place is the Me tab's row (w4_place); the place picker of docs/newsdesign/place-flow.svg waits for the owner's word.
import { label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { chevronRight, hand, tables } from "../shell/icons";
import { useLayers } from "../shell/layers";

export function FeedMenu({ onLikes, onNewTable }: { onLikes?: () => void; onNewTable?: () => void }) {
  const { close } = useLayers();
  const go = (run: () => void) => () => { close(); run(); };
  return (
    <div className="fd-sheet" data-testid="feed-menu-sheet">
      <span className="fd-grab" aria-hidden="true" />
      <h2>{say("app.feed.menu")}</h2>
      <ul className="fd-menu">
        {onLikes && <li><button type="button" onClick={go(onLikes)} data-testid="menu-likes"><Icon d={hand} /><span>{label("liked.title")}</span><Icon d={chevronRight} /></button></li>}
        {onNewTable && <li><button type="button" onClick={go(onNewTable)} data-testid="menu-new-table"><Icon d={tables} /><span>{label("web.feed.newTable")}</span><Icon d={chevronRight} /></button></li>}
      </ul>
    </div>
  );
}
