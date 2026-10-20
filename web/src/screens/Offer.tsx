// The exit screen of an offer's link (offers spec §6.2; roadmap "Offers"):
// `<storefront>/o/<code>` lands here, the page asks the node the same path for
// what it knows — the target's domain and whether the link is switched off —
// and the person goes on by a button to `/o/<code>/go`, the node's 302. The
// external address is never shown, only its domain: the node checks the
// string at publication and the redirect at every click, so the domain is
// what a person can judge and the rest is the node's to refuse.
//
// Unsigned: the link is for anybody, registered or not, so reading it needs
// no client. The call is a plain fetch of the page's own origin (the gateway
// forwards /o/* to the node, vite.config.ts).

import { useEffect, useState } from "react";
import { CODE, type ExitState, readExit } from "../../../depth/core/offer_exit.ts";
import { BRAND } from "../config.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Code } from "../ui/Code.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Actions, LinkButton } from "../ui/Links.tsx";
import { EmptyState, Notice } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";

// The reading of the exit lives in the core (depth/core/offer_exit.ts), one copy with the app shell.
type State = ExitState;
export { CODE, readExit };

// Sheet 17, the exit screen: the storefront one is leaving, the domain whole
// in the code block, "the author's link, we did not check it", continue or
// cancel. "The link leads somewhere else" is not here: a link opens the page
// fresh, before any identity is unlocked, so the report lives on the offer's
// card in the feed (Card.tsx; owner's decision 28.09, WS3).
export function Offer({ code, onHome }: { code: string; onHome: () => void }) {
  const [state, setState] = useState<State>({ at: "loading" });
  useEffect(() => {
    let live = true;
    readExit(code).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [code]);

  if (state.at === "ok") {
    const title = say("web.offer.leaving", { brand: BRAND });
    return (
      <Screen name="offer-exit" title={title} data-state={state.at} header={<HeaderScreen title={title} onBack={onHome} backLabel={say("web.offer.close")} />}>
        <section data-testid="exit" data-disabled={state.exit.disabled}>
          <Code value={state.exit.domain} data-testid="domain" />
          {state.exit.disabled
            ? <Notice data-testid="disabled">{say("web.offer.disabled")}</Notice>
            : (
              <p>
                {say("web.offer.authorLink")}
                <br />
                {say("web.offer.notChecked")}
              </p>
            )}
        </section>
        <Actions>
          <Button kind="secondary" type="button" icon="close" aria-label={say("web.offer.cancel")} onClick={onHome} data-testid="home" />
          {!state.exit.disabled && (
            <LinkButton kind="primary" href={`/o/${encodeURIComponent(code)}/go`} nofollow data-testid="go">{say("web.offer.continue")}</LinkButton>
          )}
        </Actions>
      </Screen>
    );
  }

  const title = say("web.offer.title");
  return (
    <Screen name="offer-exit" title={title} data-state={state.at} header={<HeaderScreen title={title} />}>
      {state.at === "loading" && <p className="ui-hint" data-testid="loading" role="status" aria-live="polite">…</p>}
      {state.at === "missing" && <EmptyState title={say("web.offer.noSuch")} line={say("web.offer.checkCode")} data-testid="missing" />}
      {state.at === "failed" && <EmptyState title={say("web.offer.failed")} line={say("web.offer.later")} data-testid="failed" />}
      <Button kind="secondary" type="button" icon="feed" className="ui-wide" aria-label={say("web.offer.home")} onClick={onHome} data-testid="home" />
    </Screen>
  );
}
