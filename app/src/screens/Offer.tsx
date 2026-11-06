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
import { useDrawing } from "../nd4/drawing";
import { OfferExitScreen } from "../nd4/screens/offer-exit.gen";
import { OfferExitScreenLaptop } from "../nd4/screens/offer-exit-laptop.gen";
import { OfferExitScreenTablet } from "../nd4/screens/offer-exit-tablet.gen";
import { SubPage } from "./me/parts";

type Report = "idle" | "sending" | "sent" | "failed";

export function Offer({ code, client, onBack }: { code: string; client?: Client; onBack: () => void }) {
  const [state, setState] = useState<ExitState>({ at: "loading" });
  const [report, setReport] = useState<Report>("idle");
  const wide = useDrawing();
  const Screen = wide === "laptop" ? OfferExitScreenLaptop : wide === "tablet" ? OfferExitScreenTablet : OfferExitScreen;
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
        {words ? <><h2 className="k-title k-title-big">{words[0]}</h2><p className="k-sub" data-testid={state.at}>{words[1]}</p></> : <p className="k-sub" role="status" data-testid="loading">…</p>}
      </SubPage>
    );
  }
  const { domain, disabled } = state.exit;
  // docs/newdesign4 screen 63: the archive's markup (nd4/screens/offer-exit*.gen.tsx); the line and the report's answer are the app's
  const reportable = !!client && report !== "sent" && !disabled;
  return (
    <main className="k-screen nd-screen" data-screen="offer" data-width={wide}>
      <Screen backLabel={label("common.back")} backId="offer-back" onBack={onBack} title={title} opening={say("app.offer.going_to")} domain={domain} disabled={disabled}
        line={disabled ? say("web.offer.disabled") : say("app.offer.own_site")}
        note={report === "sent" ? label("web.offer.reported") : report === "failed" ? say("web.offer.later") : undefined}
        noteId={report === "sent" ? "reported" : "report-failed"} noteRole={report === "sent" ? "status" : "alert"}
        reportLabel={say("app.offer.report")} onReport={reportable ? () => void reportLink() : undefined}
        goHref={disabled ? undefined : `/o/${encodeURIComponent(code)}/go`} goText={say("app.offer.open")} />
    </main>
  );
}
