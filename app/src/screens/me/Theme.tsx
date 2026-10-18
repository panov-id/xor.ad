// w4_theme: four tiles — auto, Dusk, light, dark — and where the choice is kept. This shell is Dusk only (owner
// 17.10.2026: «применяем новую тему. концентрируемся только на ней»): Dusk is the chosen tile, the other three are
// drawn as the sheet has them and stay shut (aria-disabled) until their themes exist. Testids: theme-<id>.
import { say } from "../../i18n";
import { SubPage } from "./parts";

const TILES: Array<{ id: "auto" | "dusk" | "light" | "dark"; name: string; sub?: string }> = [
  { id: "auto", name: "app.theme.auto", sub: "app.theme.auto_sub" },
  { id: "dusk", name: "app.theme.dusk", sub: "app.theme.this_one" },
  { id: "light", name: "app.theme.light" },
  { id: "dark", name: "app.theme.dark" },
];

export function Theme({ onBack }: { onBack: () => void }) {
  return (
    <SubPage name="theme" title={say("web.theme.title")} onBack={onBack}>
      <div className="me-themes" role="radiogroup" aria-label={say("web.theme.title")}>
        {TILES.map((t) => {
          const on = t.id === "dusk";
          return (
            <button key={t.id} type="button" role="radio" aria-checked={on} aria-disabled={on ? undefined : true} className="me-theme" data-theme={t.id} data-testid={`theme-${t.id}`}>
              <span className="me-swatch" aria-hidden="true" />
              <span className="me-theme-name">{say(t.name)}</span>
              {t.sub && <span className="me-theme-sub">{say(t.sub)}</span>}
            </button>
          );
        })}
      </div>
      <p className="me-quiet me-kept">{say("app.theme.kept")}</p>
    </SubPage>
  );
}
