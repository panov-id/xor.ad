import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
// The kit is the one source of colours and faces (WD1): tokens, then the
// accent schemes, then the page's own rules on top of their variables.
import "../../panel/design/kit/tokens.css";
import "../../panel/design/kit/schemes.css";
import "./styles.css";

// Both schemes: the page follows the system, dark unless it asks for light.
const light = window.matchMedia("(prefers-color-scheme: light)");
const scheme = () => {
  document.documentElement.classList.toggle("k-dark", !light.matches);
  document.documentElement.classList.toggle("k-light", light.matches);
};
scheme();
light.addEventListener("change", scheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
