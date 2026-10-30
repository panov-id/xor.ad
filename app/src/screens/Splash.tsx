// docs/newdesign4 screen 01 `splash-lang` (kypros-phone.html): the panel with the mark, the name in the serif, the line
// under it and twelve icons drifting around; Terms · Privacy · version at the panel's foot; under the panel the
// language button and «continue». The paper code and moving here live on register-1 now (screen 02). The language
// button opens the list in place. Testids: start, lang-open, lang, lang-<code>.
import { type ReactNode, useRef, useState } from "react";
import { brand } from "@brand";
import { documentAddress } from "@sdk/legal.ts";
import { version } from "../../package.json";
import { keep, LANG, listed, nameOf, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { FLOATS } from "./splash-art.gen";
import { flee } from "./splash-logic";

/** The sosed mark of the mockup: a circle in the accent, a house that speaks. */
export function Mark({ size = 72 }: { size?: number }) {
  return (
    <svg className="nd-mark" width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" fill="var(--accent)" />
      <g transform="translate(17,18) scale(0.86)">
        <path d="M48 6 V18 M42 8 L54 4" fill="none" stroke="var(--on-accent)" strokeWidth="3" strokeLinecap="round" />
        <path d="M10 18 H62 V56 H30 L18 66 V56 H10 Z" fill="var(--on-accent)" />
        {[25, 40].flatMap((y) => [17, 32, 47].map((x) => <rect key={`${x}${y}`} x={x} y={y} width="8" height="8" fill="var(--accent)" />))}
      </g>
    </svg>
  );
}

/** The name card of screen 01: the mark, the name, the line, the drifting icons, «share», Terms · Privacy · version.
 *  The same card stands beside the form of the register steps on a tablet and a laptop (screens 02–05); on a phone the
 *  PIN screens (06, 07, 09) put their line in place of the tagline and the PIN's dots under it. `bare`: no «share»,
 *  no Terms · Privacy (screen 14, loading). */
export function NameCard({ line, children, bare }: { line?: ReactNode; children?: ReactNode; bare?: boolean } = {}) {
  const panel = useRef<HTMLElement>(null);
  const icons = () => [...(panel.current?.querySelectorAll<HTMLElement>(".nd-fl") ?? [])];
  const away = (x: number, y: number) => {
    const b = panel.current?.getBoundingClientRect();
    if (!b) return;
    for (const e of icons()) {
      const r = e.getBoundingClientRect();
      const was = (v: string) => parseFloat(e.style.getPropertyValue(v)) || 0;
      const { px, py } = flee(r.left + r.width / 2 - was("--px"), r.top + r.height / 2 - was("--py"), r.width / 2, x, y, b);
      e.style.setProperty("--px", `${px}px`); e.style.setProperty("--py", `${py}px`);
    }
  };
  const rest = () => icons().forEach((e) => { e.style.removeProperty("--px"); e.style.removeProperty("--py"); });
  const hop = (e: HTMLElement) => { e.classList.remove("hop"); void e.offsetWidth; e.classList.add("hop"); try { navigator.vibrate?.(8); } catch { /* no vibration */ } };
  // SCREENS_spec §1: «share» is always there; a browser with no share sheet copies the address instead
  const share = () => {
    const url = `https://${brand.host}/`;
    if (typeof navigator.share === "function") void navigator.share({ title: brand.name, url }).catch(() => {});
    else void navigator.clipboard?.writeText(url).catch(() => {});
  };
  return (
    <section ref={panel} className="nd-panel nd-grow nd-splash rise" style={{ "--d": 0 } as React.CSSProperties}
      onPointerMove={(e) => away(e.clientX, e.clientY)} onPointerLeave={rest}>
      <div className="nd-splash-name">
        <Mark />
        <p className="nd-wordmark">{brand.name}</p>
        {line ?? <span className="nd-tagline">{say("app.splash.line")}</span>}
        {children}
      </div>
      {FLOATS.map((f) => (
        <span key={f.d} className="nd-fl" aria-hidden="true" onPointerDown={(e) => hop(e.currentTarget)}
          style={{ "--x": `${f.x}%`, "--y": `${f.y}%`, "--tx": `${f.tx}%`, "--ty": `${f.ty}%`, "--r": `${f.r}deg`, "--d": f.d } as React.CSSProperties}>
          <svg width="30" height="30" viewBox="0 0 48 48" fill="none" stroke={f.acc ? "var(--accent)" : "var(--text-muted)"} strokeWidth="2.3"
            strokeLinecap="round" strokeLinejoin="round" style={{ color: f.acc ? "var(--accent)" : "var(--text-muted)" }} dangerouslySetInnerHTML={{ __html: f.svg }} />
        </span>
      ))}
      {!bare && (
        <button type="button" className="nd-round" aria-label={say("app.splash.share", { name: brand.name })} onClick={share} data-testid="splash-share">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
        </button>
      )}
      {!bare && <div className="nd-legal">
        <a href={documentAddress(brand.host, "terms")} target="_blank" rel="noopener noreferrer" data-testid="splash-terms">{say("app.splash.terms")}</a>
        <span>·</span>
        <a href={documentAddress(brand.host, "privacy")} target="_blank" rel="noopener noreferrer" data-testid="splash-privacy">{say("app.splash.privacy")}</a>
        <span>·</span>
        <span className="nd-dim">v {version}</span>
      </div>}
    </section>
  );
}

export function Splash({ onStart }: { onStart: () => void }) {
  const [choosing, setChoosing] = useState(false);
  if (choosing) {
    return (
      <main className="k-screen nd-screen" data-screen="splash" data-state="lang">
        <div className="nd-col">
          <section className="nd-panel nd-grow nd-pad">
            <h1 className="nd-h1">{say("web.lang.title")}</h1>
            <ul className="k-langs" data-testid="lang">
              {listed().map((lang) => (
                <li key={lang}>
                  <button type="button" className="k-fact k-fact-btn" lang={lang} aria-current={lang === LANG ? "true" : undefined} data-on={lang === LANG ? "" : undefined}
                    data-testid={`lang-${lang}`} onClick={() => { if (keep(lang)) setChoosing(false); }}>
                    <span className="k-badge" data-c="1"><NdIcon name="lang" /></span><span>{nameOf(lang)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    );
  }
  return (
    <main className="k-screen nd-screen" data-screen="splash">
      <div className="nd-col nd-split">
        <NameCard />
        <div className="nd-form">
          <div className="nd-welcome">
            <p className="nd-h1">{say("app.splash.welcome")}</p>
            <p className="nd-tagline">{say("app.splash.welcome_1")}<br />{say("app.splash.welcome_2")}</p>
          </div>
          <div className="nd-btnrow">
          <button type="button" className="nd-panel nd-lang-btn" aria-label={say("web.lang.title")} onClick={() => setChoosing(true)} data-testid="lang-open">
            <NdIcon name="lang" /><span>{nameOf(LANG)}</span><NdIcon name="down" />
          </button>
          <button type="button" className="nd-cta rise" style={{ "--d": 2 } as React.CSSProperties} onClick={() => { keep(LANG); onStart(); }} data-testid="start">
            {say("web.offer.continue")}
          </button>
          </div>
        </div>
      </div>
    </main>
  );
}
