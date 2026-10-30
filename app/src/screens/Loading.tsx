// docs/newdesign4 screen 14 `loading` (kypros-phone.html): the name card of screen 01 with no «share» and no legal
// line; under the name a thin bar with a running stripe and «Finding your street…». Testid: loading.
import { say } from "../i18n";
import { NameCard } from "./Splash";

export function Loading() {
  return (
    <main className="k-screen nd-screen" data-screen="loading">
      <div className="nd-col">
        <NameCard bare line={
          <div className="nd-loading">
            <i className="nd-bar" aria-hidden="true"><i /></i>
            <span className="nd-tagline" role="status" data-testid="loading">{say("app.loading.street")}</span>
          </div>
        } />
      </div>
    </main>
  );
}
