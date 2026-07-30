// Shared config for the panel test suite. The panel talks to the relay control
// plane and nothing else — there is no Supabase in this suite any more, and so
// no service-role or anon key to keep out of a browser bundle.
export const PANEL_URL = process.env.PANEL_URL ?? "http://localhost:62173";
// The local stand (relay/local/docker-compose.yml) publishes the node on 62080;
// 8080 on the host belongs to the xor.ad gateway.
export const RELAY_URL = process.env.RELAY_URL ?? "http://localhost:62080";
// The stand signs sessions with a throwaway secret, so a token minted from it is
// only ever valid against that stand. Overridable for a stand configured otherwise.
export const SESSION_SECRET = process.env.SESSION_SECRET ?? "local-panel-secret";

// Fixed test identities, seeded by global-setup.
export const ADMIN_EMAIL = "test-admin@xor.ad";
export const MODERATOR_EMAIL = "test-moderator@xor.ad";
