// The «?» tour's small rules (docs/newdesign4/kit/sosed-design-2026-10-29/HELP_tours.md), apart from React so the unit tests take them as they are.
export interface TourStep {
  /** data-testid of what is ringed; a step whose target is not on the screen is shown centred. */
  target: string;
  title: string;
  text: string;
}

export const tourKey = (id: string): string => `sosed.tour.${id}`;

/** Per device, in localStorage; a closed or throwing storage reads as «seen», so a tour never nags where it cannot be remembered. */
export function tourSeen(id: string, storage?: Pick<Storage, "getItem">): boolean {
  try {
    const s = storage ?? localStorage;
    return s.getItem(tourKey(id)) !== null;
  } catch {
    return true;
  }
}

export function markTourSeen(id: string, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? localStorage).setItem(tourKey(id), "1");
  } catch {
    /* no storage: the tour shows again next time, which is the lesser harm */
  }
}

/** First entry only, and never under automation: a crowd or e2e run must find the field uncovered (navigator.webdriver). */
export function shouldAutoShow(seen: boolean, webdriver: boolean | undefined): boolean {
  return !seen && webdriver !== true;
}

/** The step after `at`, or null at the last one (the button then closes). */
export function nextStep(at: number, count: number): number | null {
  return at + 1 < count ? at + 1 : null;
}
