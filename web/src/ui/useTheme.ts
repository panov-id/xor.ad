import { useEffect } from "react";
import { BRAND } from "../config.ts";
import { applyTheme } from "../theme.ts";
import { usePhase } from "./usePhase.ts";

// "auto" follows the phase at the feed's place (the same clock as the feed's
// sky, usePhase): mounted once by the face with the place's longitude.
export function useAutoTheme(lon: number): void {
  const phase = usePhase(lon);
  useEffect(() => {
    applyTheme(BRAND, phase);
  }, [phase]);
}
