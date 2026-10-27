// The prototype's loading (docs/newdesign/proto/loading.html): one panel, the brand's mark and a turning ring in its middle.
import { brand } from "@brand";
import { say } from "../i18n";
import { Logo } from "../shell/Scene";

export function Loading() {
  return (
    <main className="k-screen" data-screen="loading">
      <div className="k-col">
        <section className="k-panel k-grow">
          <div className="k-centre">
            <Logo size={84} label={brand.host} />
            <svg className="k-spin" width="40" height="40" aria-hidden="true">
              <circle cx="20" cy="20" r="16" fill="none" stroke="var(--tile-strong)" strokeWidth="5" />
              <circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray="30.2 100.5" transform="rotate(-90 20 20)" />
            </svg>
            <p className="k-sub" data-testid="loading">{say("app.loading.opening")}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
