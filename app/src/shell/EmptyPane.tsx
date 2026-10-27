// The right pane of the desktop with nothing open in it (designer README «Правила каркаса» 8; desktop-1920 tables.svg):
// the zone's icon in a round tile, «Nothing open», a hint what opens here.
import { say } from "../i18n";
import { NdIcon } from "./NdIcon";

export function EmptyPane({ icon, hint }: { icon: string; hint: string }) {
  return (
    <aside className="nd-pane nd-pane-empty" aria-label={say("app.pane.nothing")} data-testid="pane-empty">
      <span className="nd-pane-mark"><NdIcon name={icon} /></span>
      <p className="nd-pane-title">{say("app.pane.nothing")}</p>
      <p className="nd-pane-hint">{say(hint)}</p>
    </aside>
  );
}
