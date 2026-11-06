// The right pane of the desktop with nothing open in it: the archive's screen 44 (nd4/screens/empty-panel.gen.tsx), the pane's place stays the app's.
import { say } from "../i18n";
import { EmptyPanel } from "../nd4/screens/empty-panel.gen";

export function EmptyPane({ hint }: { hint: string }) {
  return (
    <aside className="nd-pane nd-pane-empty" aria-label={say("app.pane.nothing")} data-testid="pane-empty">
      <EmptyPanel title={say("app.pane.nothing")} hint={say(hint)} />
    </aside>
  );
}
