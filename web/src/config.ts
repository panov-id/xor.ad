// One code for both storefronts; the brand is a parameter. The storefront's
// key names the face to the node (x-api-key on every call, as the terminal
// does); it is a storefront's public key, not a secret. Baked at build, as the
// panel bakes VITE_RELAY_API_URL (panel/src/providers/constants.ts).
export const BRAND = (import.meta.env.VITE_BRAND as string | undefined) ?? "sosed";
export const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined) ?? "ak_pub_webdev00000000001";

// Every call goes to the page's own origin; the dev server or the gateway
// forwards the node's paths to the node (vite.config.ts says why).
export const NODE_BASE = `${location.origin}/`;

export const NAMES: Record<string, string> = { sosed: "sosed.place", neighbro: "neighbro.place" };
