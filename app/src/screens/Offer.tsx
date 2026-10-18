// w4_offer: the exit screen of an offer's link (offers spec §6.2): "You're going to" and the domain of the venue's
// own site — never the whole address — and Open the site, which is the node's own redirect (`/o/<code>/go`, a 302
// the node counts). The web's Offer (web/src/screens/Offer.tsx) with the reading from depth/core/offer_exit.ts.
// "Report a wrong link" (POST /o/<code>/report, signed) is offered only to an identity open on the page — the exit
// opens before any unlock, so a link alone has no identity to sign with (owner's decision 28.09, WS3); the node
// answers 202 whether the report counted, so the line only says it was received.
import { useEffect, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { type ExitState, readExit } from "@sdk/offer_exit.ts";
import { label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { logIn } from "./cabinet/icons";
import { SubPage } from "./me/parts";

type Report = "idle" | "sending" | "sent" | "failed";

export function Offer({ code, client, onBack }: { code: string; client?: Client; onBack: () => void }) {
  const [state, setState] = useState<ExitState>({ at: "loading" });
  const [report, setReport] = useState<Report>("idle");
  useEffect(() => {
    let live = true;
    void readExit(code).then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [code]);

  async function reportLink() {
    if (!client || report === "sending") return;
    setReport("sending");
    try {
      const answer = await client.request("POST", `/o/${encodeURIComponent(code)}/report`);
      setReport(answer.status === 202 ? "sent" : "failed");
    } catch {
      setReport("failed");
    }
  }

  const title = say("app.offer.leaving");
  if (state.at !== "ok") {
    const words = state.at === "missing" ? [say("web.offer.noSuch"), say("web.offer.checkCode")] : state.at === "failed" ? [say("web.offer.failed"), say("web.offer.later")] : null;
    return (
      <SubPage name="offer" title={title} onBack={onBack}>
        {words ? <><h2 className="me-title">{words[0]}</h2><p className="me-quiet" data-testid={state.at}>{words[1]}</p></> : <p className="me-quiet" role="status" data-testid="loading">…</p>}
      </SubPage>
    );
  }
  const { domain, disabled } = state.exit;
  return (
    <SubPage name="offer" title={title} onBack={onBack}
      foot={disabled ? undefined : (
        <a className="cta cta-primary" href={`/o/${encodeURIComponent(code)}/go`} rel="nofollow noopener noreferrer" data-testid="go">
          <Icon d={logIn} /><span>{say("app.offer.open")}</span>
        </a>
      )}>
      <h2 className="cb-going">{say("app.offer.going_to")}</h2>
      <div className="cb-domain" data-testid="exit" data-disabled={disabled}>
        <strong data-testid="domain">{domain}</strong>
        <p>{disabled ? say("web.offer.disabled") : say("app.offer.own_site")}</p>
      </div>
      {client && report !== "sent" && !disabled && (
        <button type="button" className="cb-report" aria-disabled={report === "sending" || undefined} onClick={() => void reportLink()} data-testid="report">{say("app.offer.report")}</button>
      )}
      {report === "sent" && <p className="me-quiet" role="status" data-testid="reported">{label("web.offer.reported")}</p>}
      {report === "failed" && <p className="me-error" role="alert" data-testid="report-failed">{say("web.offer.later")}</p>}
    </SubPage>
  );
}
