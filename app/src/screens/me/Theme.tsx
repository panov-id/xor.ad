// w4_theme: «auto» and the four themes of the designer's archives (owner 2026-10-26: white, sea, plum, black; auto is
// white by day and black by night). A tile is the choice: kept on this device (brands/sosed/theme.ts) and put on <html>
// at once. Testids: theme-<id>.
import { useState } from "react";
import { say } from "../../i18n";
import { applyTheme, type Choice, readChoice, saveChoice } from "../../brands/sosed/theme";
import { SubPage } from "./parts";

const TILES: Array<{ id: Choice; name: string; sub?: string }> = [
  { id: "auto", name: "app.theme.auto", sub: "app.theme.auto_sub" },
  { id: "white", name: "app.theme.white" },
  { id: "sea", name: "app.theme.sea" },
  { id: "plum", name: "app.theme.plum" },
  { id: "black", name: "app.theme.black" },
];

export function Theme({ onBack }: { onBack: () => void }) {
  const [chosen, setChosen] = useState<Choice>(() => readChoice());
  const pick = (id: Choice) => { saveChoice(id); applyTheme(); setChosen(id); };
  return (
    <SubPage name="theme" title={say("web.theme.title")} onBack={onBack}>
      <div className="me-themes" role="radiogroup" aria-label={say("web.theme.title")}>
        {TILES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={t.id === chosen} className="me-theme" data-theme={t.id}
            onClick={() => pick(t.id)} data-testid={`theme-${t.id}`}>
            <span className="me-swatch" aria-hidden="true" />
            <span className="me-theme-name">{say(t.name)}</span>
            {t.sub && <span className="me-theme-sub">{say(t.sub)}</span>}
          </button>
        ))}
      </div>
      <p className="me-quiet me-kept">{say("app.theme.kept")}</p>
    </SubPage>
  );
}
