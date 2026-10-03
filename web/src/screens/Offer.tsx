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
import { BRAND } from "../config.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import "./place.css";
import { Icon } from "../ui/Icon.tsx";

type Exit = { domain: string; disabled: boolean };
type State = { at: "loading" } | { at: "ok"; exit: Exit } | { at: "missing" } | { at: "failed" };

export const CODE = /^[A-Za-z0-9_-]{4,64}$/;

export async function readExit(code: string, fetcher: typeof fetch = fetch): Promise<State> {
  if (!CODE.test(code)) return { at: "missing" };
  try {
    const r = await fetcher(`/o/${encodeURIComponent(code)}`, { headers: { accept: "application/json" } });
    if (r.status === 404) return { at: "missing" };
    if (r.status !== 200) return { at: "failed" };
    const body = (await r.json()) as Partial<Exit>;
    if (typeof body.domain !== "string" || typeof body.disabled !== "boolean") return { at: "failed" };
    return { at: "ok", exit: { domain: body.domain, disabled: body.disabled } };
  } catch {
    return { at: "failed" };
  }
}

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
    return (
      <main className="screen offer-exit" data-screen="offer-exit" data-state={state.at}>
        <HeaderScreen title="" onBack={onHome} backLabel={say("web.offer.close")} />
        <section className="offer-leave" data-testid="exit" data-disabled={state.exit.disabled}>
          <h1 className="offer-display">{say("web.offer.leaving", { brand: BRAND })}</h1>
          <p className="offer-domain" data-testid="domain">{state.exit.domain}</p>
          {state.exit.disabled
            ? <p className="warn" data-testid="disabled">{say("web.offer.disabled")}</p>
            : (
              <p className="offer-note">
                {say("web.offer.authorLink")}
                <br />
                {say("web.offer.notChecked")}
              </p>
            )}
        </section>
        <footer className="offer-actions">
          {!state.exit.disabled && (
            <a className="ui-button ui-primary ui-icon-only ui-wide offer-go" href={`/o/${encodeURIComponent(code)}/go`} rel="noopener noreferrer nofollow" aria-label={say("web.offer.continue")} data-testid="go">
              <Icon name="open" />
            </a>
          )}
          <Button kind="secondary" type="button" icon="close" className="ui-wide" aria-label={say("web.offer.cancel")} onClick={onHome} data-testid="home" />
        </footer>
      </main>
    );
  }

  return (
    <main className="screen offer-exit" data-screen="offer-exit" data-state={state.at}>
      <HeaderScreen title={say("web.offer.title")} />
      {state.at === "loading" && <p className="muted" data-testid="loading" role="status" aria-live="polite">…</p>}
      {state.at === "missing" && (
        <section className="place-empty-block" data-testid="missing">
          <h2>{say("web.offer.noSuch")}</h2>
          <p className="muted">{say("web.offer.checkCode")}</p>
        </section>
      )}
      {state.at === "failed" && (
        <section className="place-empty-block" data-testid="failed">
          <h2>{say("web.offer.failed")}</h2>
          <p className="muted">{say("web.offer.later")}</p>
        </section>
      )}
      <footer className="place-footer">
        <Button kind="secondary" type="button" icon="feed" className="ui-wide" aria-label={say("web.offer.home")} onClick={onHome} data-testid="home" />
      </footer>
    </main>
  );
}
