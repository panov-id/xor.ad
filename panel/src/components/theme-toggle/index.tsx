// Light, dark, or whatever the system says. The choice is stamped on <html> as
// data-theme, where a CSS selector can outrank the media query in both
// directions — a toggle that only worked away from the system default would be
// worse than none.
//
// The initial value is read in index.html before React mounts, so the page never
// paints in the wrong theme first.

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "panel_theme";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Theme: auto", light: "Theme: light", dark: "Theme: dark" };

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function storedTheme(): Theme {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(NEXT[theme])}
      // The label states the current setting rather than the next one: a control
      // that reads as a promise is read wrong half the time.
      aria-label={LABEL[theme]}
      title="Switch between auto, light and dark"
    >
      {LABEL[theme]}
    </button>
  );
};
