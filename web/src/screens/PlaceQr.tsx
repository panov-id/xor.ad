// Screen 26, the place QR (sosed.place docs/26-place-qr_RU.md; sheet panel/design/screen-26-place-qr.svg):
// the feed's point and a step make a link `<storefront>/location#p=…&s=…` (geo/qr.ts) and its QR,
// drawn on the device — no request, nothing kept. Share (the device's own menu), save as a picture,
// copy the link (owner 12.10.2026: «to show someone, screenshot it, or send the link»).
// At 100 and 300 m a line names the price; it does not forbid (owner 19.09.2026).

import qrcode from "qrcode-generator";
import { useMemo, useState } from "react";
import { say } from "../locales/say.ts";
import type { Place } from "../geo/place.ts";
import { STEP_METRES, qrLink, type Step } from "../geo/qr.ts";
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Segments } from "../ui/Segments.tsx";
import { Split } from "../ui/Split.tsx";

const metres = (m: number) => (m < 1000 ? say("web.feed.m", { n: m }) : say("web.feed.km", { n: m / 1000 }));

// The QR as SVG modules: one path, no canvas, nothing from the network.
function modulesOf(text: string): { size: number; d: string } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return { size: n + 8, d };
}

// The kit's constant paper and ink (panel/design/kit/tokens.css), resolved: an image
// and a canvas know no CSS variables.
const kit = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

async function pngOf(svg: SVGSVGElement): Promise<Blob | null> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelector("path")?.setAttribute("fill", kit("--ink"));
  const src = new XMLSerializer().serializeToString(copy);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = kit("--paper");
  g.fillRect(0, 0, 1024, 1024);
  g.drawImage(img, 0, 0, 1024, 1024);
  return new Promise((done) => canvas.toBlob(done, "image/png"));
}

export function PlaceQr({ place, onBack }: { place: Place; onBack: () => void }) {
  const [step, setStep] = useState<Step>(3);
  const [made, setMade] = useState(false);
  const [said, setSaid] = useState("");
  const link = useMemo(() => qrLink(location.origin, place, step), [place, step]);
  const code = useMemo(() => modulesOf(link), [link]);
  const where = `${place.name} · ${metres(STEP_METRES[step - 1])}`;

  async function copy() {
    try { await navigator.clipboard.writeText(link); setSaid(say("web.ui.copied")); } catch { setSaid(link); }
  }
  async function share() {
    if (navigator.share) { try { await navigator.share({ title: where, url: link }); } catch { /* the person closed the menu */ } }
    else await copy();
  }
  async function save() {
    const svg = document.querySelector<SVGSVGElement>('[data-testid="qr-code"]');
    const png = svg && await pngOf(svg);
    if (!png) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = "place-qr.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Screen name="place-qr" title={say("web.qr.title")} header={<HeaderScreen title={say("web.qr.title")} onBack={onBack} backLabel={say("common.back")} />}>
      <p className="ui-hint">{say("web.qr.what")}</p>
      <Segments
        label={say("web.qr.step")}
        value={String(step)}
        onChange={(next) => { setStep(Number(next) as Step); setSaid(""); }}
        testid="qr-step"
        options={STEP_METRES.map((m, i) => ({ value: String(i + 1), label: metres(m), testid: `qr-step-${i + 1}` }))}
      />
      {step <= 2 && <p className="ui-hint" data-testid="qr-price">{say("web.qr.price")}</p>}
      <p className="ui-hint" data-testid="qr-where">{where}</p>
      {!made ? (
        <Split><Button type="button" kind="primary" icon="code" aria-label={say("web.qr.make")} onClick={() => setMade(true)} data-testid="qr-make" /></Split>
      ) : (
        <>
          <svg data-testid="qr-code" data-link={link} viewBox={`0 0 ${code.size} ${code.size}`} width="100%" role="img"
            aria-label={say("web.qr.code", { where })} style={{ maxWidth: 320, background: "var(--paper)", display: "block", margin: "0 auto" }} shapeRendering="crispEdges">
            <path d={code.d} fill="var(--ink)" />
          </svg>
          <Split>
            <Button type="button" icon="open" aria-label={say("web.qr.share")} onClick={() => void share()} data-testid="qr-share" />
            <Button type="button" icon="link" aria-label={say("web.qr.copy")} onClick={() => void copy()} data-testid="qr-copy" />
            <Button type="button" icon="queue" aria-label={say("web.qr.save")} onClick={() => void save()} data-testid="qr-save" />
          </Split>
          <p role="status" className="ui-hint" data-testid="qr-said">{said}</p>
        </>
      )}
    </Screen>
  );
}
