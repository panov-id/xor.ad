import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { BRAND } from "./config.ts";
// The kit is the one source of colours and faces (WD1): tokens, then the
// accent schemes, then the page's own rules on top of their variables.
import "../../panel/design/kit/tokens.css";
import "../../panel/design/kit/schemes.css";
import "./styles.css";

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
