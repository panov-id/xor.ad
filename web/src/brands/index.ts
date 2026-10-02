// The brand's presentation layer, chosen at build time (step 5 of the brand
// split). "@brand" is a Vite alias (vite.config.ts) to brands/<VITE_BRAND>/,
// so only that brand's views and css are in the bundle — the other tree is
// never imported. tsconfig maps "@brand" to sosed for the type check; the
// line below holds neighbro to the same shape, as a type only (erased).
import type * as Sosed from "./sosed/index.tsx";
import type * as Neighbro from "./neighbro/index.tsx";

export { ArrivalView, CardView, ChatView, ComposeView, FeedView, MatchView } from "@brand";

type Views = Pick<typeof Sosed, "ArrivalView" | "CardView" | "ChatView" | "ComposeView" | "FeedView" | "MatchView">;
// Red in tsc when neighbro's views stop taking what sosed's take.
export type NeighbroFits = typeof Neighbro extends Views ? true : never;
export const NEIGHBRO_FITS: NeighbroFits = true;
