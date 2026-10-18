// w4_place-qr: the place's QR on a white card, what it does in one line, Share. The link is the web's
// (depth/core/place_qr.ts qrLink: the cell rides in the fragment, the node learns nothing), at the web's
// default zone (1 km); the code is drawn by qrcode-generator, as the web draws it. Share hands the link to the
// system's share sheet, or copies it where there is none. Testids (the web's): qr-code (data-link), qr-share, qr-said.
import qrcode from "qrcode-generator";
import { useMemo, useState } from "react";
import { qrLink, type Step } from "@sdk/place_qr.ts";
import { say } from "../../i18n";
import type { Place } from "../../place";
import { Icon } from "../../shell/Icon";
import { link as linkIcon } from "./icons";
import { SubPage } from "./parts";

const STEP: Step = 3;

function modulesOf(text: string): { size: number; d: string } {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const n = code.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (code.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return { size: n, d };
}

export function PlaceQr({ place, onBack }: { place: Place; onBack: () => void }) {
  const [said, setSaid] = useState("");
  const link = useMemo(() => qrLink(location.origin, place, STEP), [place]);
  const code = useMemo(() => modulesOf(link), [link]);
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: place.name, url: link }); } catch { /* the person closed the sheet */ }
      return;
    }
    try { await navigator.clipboard.writeText(link); setSaid(say("web.ui.copied")); } catch { setSaid(link); }
  }
  return (
    <SubPage name="place-qr" title={say("web.qr.title")} onBack={onBack}
      foot={<button type="button" className="cta cta-primary" onClick={() => void share()} data-testid="qr-share"><Icon d={linkIcon} /><span>{say("app.qr.share")}</span></button>}>
      <div className="me-qr-card">
        <svg className="me-qr" data-testid="qr-code" data-link={link} viewBox={`0 0 ${code.size} ${code.size}`} role="img"
          aria-label={say("web.qr.code", { where: place.name })} shapeRendering="crispEdges">
          <path d={code.d} />
        </svg>
      </div>
      <p className="me-quiet me-qr-what">{say("app.qr.what")}</p>
      <p role="status" className="me-quiet" data-testid="qr-said">{said}</p>
    </SubPage>
  );
}
