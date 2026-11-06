// Which archive drawing a screen with no nav takes (screens 14, 15: drawn whole, the frame is the window):
// the laptop file from --bp-desktop (1440), the tablet file from 600 (the archive's tablet frame is 820, below
// --bp-tablet; the place's screens take the same 600 in Place.tsx), the phone file below.
import { useEffect, useState } from "react";
import { useMinWidth } from "../shell/useMinWidth";

export type Drawing = "phone" | "tablet" | "laptop";
export const TABLET_FROM = 600;

export function useDrawing(): Drawing {
  const desk = useMinWidth("--bp-desktop");
  const [tab, setTab] = useState(() => innerWidth >= TABLET_FROM);
  useEffect(() => {
    const on = () => setTab(innerWidth >= TABLET_FROM);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return desk ? "laptop" : tab ? "tablet" : "phone";
}
