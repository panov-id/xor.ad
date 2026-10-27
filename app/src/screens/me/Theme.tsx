// w4_theme: two choices that follow the device's light or dark, «colour» (sea / plum, the default) and «classic»
// (white / black), and the four themes of the designer's archives to pick for good (owner 2026-10-26). A tile is the choice: kept on this device (brands/sosed/theme.ts) and put on <html>
// at once. Testids: theme-<id>.
import { useState } from "react";
import { say } from "../../i18n";
import { applyTheme, type Choice, readChoice, saveChoice } from "../../brands/sosed/theme";
import { SubPage } from "./parts";

const FOLLOW: Array<{ id: Choice; name: string; sub: string }> = [
  { id: "colour", name: "app.theme.colour", sub: "app.theme.colour_sub" },
  { id: "classic", name: "app.theme.classic", sub: "app.theme.classic_sub" },
];
const FIXED: Array<{ id: Choice; name: string }> = [
  { id: "sea", name: "app.theme.sea" },
  { id: "plum", name: "app.theme.plum" },
  { id: "white", name: "app.theme.white" },
  { id: "black", name: "app.theme.black" },
];

export function Theme({ onBack }: { onBack: () => void }) {
  const [chosen, setChosen] = useState<Choice>(() => readChoice());
  const pick = (id: Choice) => { saveChoice(id); applyTheme(); setChosen(id); };
  return (
    <SubPage name="theme" title={say("web.theme.title")} onBack={onBack}>
      <div role="radiogroup" aria-label={say("web.theme.title")}>
        <p className="me-theme-head">{say("app.theme.follow")}</p>
        <div className="me-themes">{FOLLOW.map(tile)}</div>
        <p className="me-theme-head">{say("app.theme.fixed")}</p>
        <div className="me-themes">{FIXED.map(tile)}</div>
      </div>
      <p className="k-sub me-kept">{say("app.theme.kept")}</p>
    </SubPage>
  );

  function tile(t: { id: Choice; name: string; sub?: string }) {
    return (
      <button key={t.id} type="button" role="radio" aria-checked={t.id === chosen} className="me-theme" data-theme={t.id}
        onClick={() => pick(t.id)} data-testid={`theme-${t.id}`}>
        <span className="me-swatch" aria-hidden="true" />
        <span className="me-theme-name">{say(t.name)}</span>
        {t.sub && <span className="me-theme-sub">{say(t.sub)}</span>}
      </button>
    );
  }
}
