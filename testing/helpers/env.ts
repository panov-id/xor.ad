// Landing E2E config. The pages are served by the xor.ad gateway (nginx), which
// routes by hostname; Chromium's host-resolver-rules (see the Playwright config)
// map both faces to 127.0.0.1:8080. The gateway proxies the landing's API calls
// to the local relay stand, and the check reads the lead back from that stand's
// admin routes — there is no Supabase in this suite any more.
export const GATEWAY_PORT = process.env.GATEWAY_PORT ?? "8080";
export const SOSED_URL = `http://sosed.place:${GATEWAY_PORT}`;
export const NEIGHBRO_URL = `http://neighbro.place:${GATEWAY_PORT}`;
// The stand publishes the node on 8081 (8080 belongs to the gateway).
export const RELAY_URL = process.env.RELAY_URL ?? "http://localhost:8081";
// The stand signs sessions with a throwaway secret, so a token minted from it is
// only ever valid against that stand.
export const SESSION_SECRET = process.env.SESSION_SECRET ?? "local-panel-secret";
