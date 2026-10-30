// docs/newdesign4 screen 15 `update` (kypros-phone.html): over everything, × at the top (as «Later»), the refresh mark in a round tile, «A new sosed
// is ready», the version and «takes a second, nothing is lost», «Later» and «Update» side by side. Testids: update,
// update-later, update-go.
import { brand } from "@brand";
import { say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";

export function Update({ version, onLater }: { version: string; onLater: () => void }) {
  return (
    <main className="k-screen nd-screen nd-update" data-screen="update" role="dialog" aria-modal="true" aria-labelledby="update-title" data-testid="update">
      <div className="nd-col">
        <header className="nd-head">
          <button type="button" className="nd-back" aria-label={say("app.update.later")} onClick={onLater} data-testid="update-close"><NdIcon name="close" /></button>
        </header>
        <div className="nd-update-mid">
          <span className="nd-update-mark rise"><NdIcon name="refresh" /></span>
          <h1 className="nd-h1" id="update-title">{say("app.update.title", { name: brand.name })}</h1>
          <p className="nd-sub">{say("app.update.version", { v: version })}<br />{say("app.update.safe")}</p>
        </div>
        <div className="nd-btnrow">
          <button type="button" className="nd-cta" data-tile="" onClick={onLater} data-testid="update-later">{say("app.update.later")}</button>
          <button type="button" className="nd-cta rise" onClick={() => location.reload()} data-testid="update-go"><NdIcon name="refresh" />{say("app.update.go")}</button>
        </div>
      </div>
    </main>
  );
}
