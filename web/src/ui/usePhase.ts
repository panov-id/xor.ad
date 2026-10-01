import { useEffect, useState } from "react";
import { phaseAt, type Phase, zoneOfLongitude } from "./phase.ts";

// The phase at the feed's place, kept current: read again every minute, so a
// feed left open across 17:00 turns to sunset without a reload; the timer is
// cleared when the feed goes (review panel 01.10.2026, item 2).
export const PHASE_TICK_MS = 60_000;

export function usePhase(lon: number): Phase {
  const zone = zoneOfLongitude(lon);
  const [phase, setPhase] = useState<Phase>(() => phaseAt(new Date(), zone));
  useEffect(() => {
    setPhase(phaseAt(new Date(), zone));
    const timer = setInterval(() => setPhase(phaseAt(new Date(), zone)), PHASE_TICK_MS);
    return () => clearInterval(timer);
  }, [zone]);
  return phase;
}
