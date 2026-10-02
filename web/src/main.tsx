import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { BRAND } from "./config.ts";
import { applyTheme } from "./theme.ts";
import { phaseAt } from "./ui/phase.ts";
// The kit is the one source of colours and faces (WD1): tokens, then the
// accent schemes, then the page's own rules on top of their variables.
import "../../panel/design/kit/tokens.css";
import "../../panel/design/kit/schemes.css";
import "./styles.css";
// The comic face over everything (2026-10-01): under .k-comic-face, so it wins.
import "./comic.css";
// The brand's themes (themes.gen.css, from web/themes/<brand>/*.json): the
// --bg/--surface/... tokens per [data-brand][data-theme].
import "./themes.gen.css";

// The theme goes on <html> before the first render. Until the face knows its
// place (App.tsx useAutoTheme) "auto" reads the device's clock. This runs in
// the page's own module, not an inline script: the CSP (vite.config.ts)
// refuses those; vite.config.ts also writes data-brand into the HTML at build,
// so the brand's light theme is drawn even before this module runs.
applyTheme(BRAND, phaseAt(new Date()));

// The k-* classes stay while comic.css and the kit draw the screens (they
// read these classes, not the theme tokens yet).
// Both schemes: the page follows the system, dark unless it asks for light.
// Over them the comic (owner 2026-10-01): the brand's day or night scheme
// from schemes.css — k-comic[-night] for sosed, k-comic-neighbro[-night].
const light = window.matchMedia("(prefers-color-scheme: light)");
const COMIC = BRAND === "neighbro" ? "k-comic-neighbro" : "k-comic";
const scheme = () => {
  const html = document.documentElement.classList;
  html.toggle("k-dark", !light.matches);
  html.toggle("k-light", light.matches);
  html.add("k-comic-face", BRAND === "neighbro" ? "b-neighbro" : "b-sosed");
  html.toggle(COMIC, light.matches);
  html.toggle(`${COMIC}-night`, !light.matches);
};
scheme();
light.addEventListener("change", scheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
