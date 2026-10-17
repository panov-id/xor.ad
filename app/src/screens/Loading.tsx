// w2_loading (sosed Dusk, mobile_390_w2_loading): the web's loading frame (web/src/App.tsx
// view() "loading": the tagline as the title, a `loading` hint) in the new design — the long wait
// is a ring that turns all the time (MOTION.md: yellow arc 28% on panel2, one turn in 0.9 s).
import { brand } from "@brand";
import { say } from "../i18n";
import { Icon } from "../shell/Icon";
import { home } from "../shell/icons";
import { Screen } from "../shell/Screen";

export function Loading() {
  return (
    <Screen name="loading" title={say("web.splash.tagline")} className="loading">
      <h1 className="sr-only">{brand.host}</h1>
      <div className="col loading-body">
        <div className="circle" aria-hidden="true"><Icon d={home} /></div>
        <svg className="ring" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
          <circle className="track" cx="36" cy="36" r="33" />
          <circle className="arc" cx="36" cy="36" r="33" pathLength="100" />
        </svg>
        <p data-testid="loading">{say("app.loading.opening")}</p>
      </div>
    </Screen>
  );
}
