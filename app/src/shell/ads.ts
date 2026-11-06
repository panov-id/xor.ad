// The one place the ads flag is read (VITE_ADS, build time, off by default); see ads-logic.ts. Every ad piece in the app asks here.
import { say } from "../i18n";
import { type AdSlotKey, type AdSpec, adSpec, adsOn } from "./ads-logic";

export const ADS_ON = adsOn(import.meta.env.VITE_ADS);

/** The slot's spec for a component's `ad` prop: undefined with the flag off. */
export function adFor(slot: AdSlotKey): AdSpec | undefined {
  return adSpec(slot, say("app.ad.slot"), ADS_ON);
}
