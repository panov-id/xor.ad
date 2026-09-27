// The exit screen of an offer's link (offers spec §6.2; roadmap "Offers"):
// `<storefront>/o/<code>` lands here, the page asks the node the same path for
// what it knows — the target's domain and whether the link is switched off —
// and the person goes on by a button to `/o/<code>/go`, the node's 302. The
// external address is never shown, only its domain: the node checks the
// string at publication and the redirect at every click, so the domain is
// what a person can judge and the rest is the node's to refuse.
//
// Unsigned: the link is for anybody, registered or not, so this screen needs
// no client. The call is a plain fetch of the page's own origin (the gateway
// forwards /o/* to the node, vite.config.ts).

import { useEffect, useState } from "react";
import { say } from "../locales/say.ts";

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

export function Offer({ code, onHome }: { code: string; onHome: () => void }) {
  const [state, setState] = useState<State>({ at: "loading" });
  useEffect(() => {
    let live = true;
    readExit(code).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [code]);

  return (
    <main className="screen offer-exit" data-screen="offer-exit" data-state={state.at}>
      <header>
        <h1>{say("web.offer.title")}</h1>
      </header>
      {state.at === "loading" && <p className="muted" data-testid="loading" role="status" aria-live="polite">…</p>}
      {state.at === "missing" && (
        <section className="empty" data-testid="missing">
          <h2>{say("web.offer.noSuch")}</h2>
          <p className="muted">{say("web.offer.checkCode")}</p>
        </section>
      )}
      {state.at === "failed" && (
        <section className="empty" data-testid="failed">
          <h2>{say("web.offer.failed")}</h2>
          <p className="muted">{say("web.offer.later")}</p>
        </section>
      )}
      {state.at === "ok" && (
        <section className="exit" data-testid="exit" data-disabled={state.exit.disabled}>
          <p>
            {say("web.offer.leadsTo")} <strong data-testid="domain">{state.exit.domain}</strong>.
          </p>
          {state.exit.disabled
            ? (
              <p className="warn" data-testid="disabled">
                {say("web.offer.disabled")}
              </p>
            )
            : (
              <>
                <p className="muted">
                  {say("web.offer.warn")}
                </p>
                <a className="button primary" href={`/o/${encodeURIComponent(code)}/go`} rel="noopener noreferrer nofollow" data-testid="go">
                  {say("web.offer.go", { domain: state.exit.domain })}
                </a>
              </>
            )}
        </section>
      )}
      <footer>
        <button type="button" onClick={onHome} data-testid="home">{say("web.offer.home")}</button>
      </footer>
    </main>
  );
}
