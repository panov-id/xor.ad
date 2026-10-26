import { useEffect, useState } from "react";

/**
 * Whether the window is at least as wide as a breakpoint token (tokens/wide.css --bp-tablet, --bp-desktop): the token is read off :root,
 * because a media query cannot read it; the answer follows the window. For a screen whose markup differs on the wide sheets.
 */
export function useMinWidth(token: string): boolean {
  const query = () => `(min-width: ${getComputedStyle(document.documentElement).getPropertyValue(token).trim()})`;
  const [wide, setWide] = useState(() => typeof matchMedia === "function" && matchMedia(query()).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(query()), on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return wide;
}
