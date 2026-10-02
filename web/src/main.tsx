import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { BRAND } from "./config.ts";
import { applyTheme } from "./theme.ts";
import { phaseAt } from "./ui/phase.ts";
// The kit gives the geometry (--s-*, --r-*, --control-h on :root) and the
// faces; the colours are the brand's theme alone (themes.gen.css, from
// web/themes/<brand>/*.json, per [data-brand][data-theme]) — <html> wears no
// k-* scheme class any more, so no kit colour applies (step 8, 02.10.2026).
// styles.css names the kit's colour words (--panel, --muted, ...) as theme
// tokens for the shared screens.
import "../../panel/design/kit/tokens.css";
import "./styles.css";
import "./themes.gen.css";

// The theme goes on <html> before the first render. Until the face knows its
// place (App.tsx useAutoTheme) "auto" reads the device's clock. This runs in
// the page's own module, not an inline script: the CSP (vite.config.ts)
// refuses those; vite.config.ts also writes data-brand into the HTML at build,
// so the brand's light theme is drawn even before this module runs.
applyTheme(BRAND, phaseAt(new Date()));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
