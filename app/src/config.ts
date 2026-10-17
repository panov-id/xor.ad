// Where the node is and who calls it, as web/src/config.ts has it (the sosed storefront only for now).
// Every call goes to the page's own origin; the dev server or the gateway forwards the node's paths
// to the node (vite.config.ts says why). The storefront's key is public, baked at build.
export const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined) ?? "ak_pub_webdev00000000001";
export const NODE_BASE = `${location.origin}/`;
