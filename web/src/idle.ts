// Five minutes without input and the page locks (W13-WL; the storefronts' screen 12, docs/depth-client_RU.md
// the paragraph of 2026-09-17). The watching itself is shared with the app shell
// (depth/web-platform/idle.ts); this binds it to the web's grace and to the stand's build parameter
// (VITE_STAND=1 reads the wait from sessionStorage "xor-idle-ms"; a real page never does).
import { idleMsOf as idleMsFor, watchIdle as watch } from "../../depth/web-platform/idle.ts";
import { stampGrace } from "./vault.ts";

export const idleMsOf = (): number => idleMsFor(import.meta.env.VITE_STAND === "1");

// Starts the clock; every input starts it over; `stop` takes the listeners off and lets the clock go.
export const watchIdle = (onIdle: () => void, ms = idleMsOf()): { stop(): void } => watch(onIdle, stampGrace, ms);
