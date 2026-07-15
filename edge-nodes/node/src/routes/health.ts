import { config } from "../config.ts";
import { json } from "../lib/http.ts";
import { storageEnabled } from "../lib/storage.ts";

// Liveness/readiness for the balancer (Bunny geo-steering health checks).
export function health(): Response {
  return json({
    status: "ok",
    node: config.nodeId,
    region: config.region,
    env: config.envName,
    storage: storageEnabled(),
    email: Boolean(config.resend.key),
    ts: new Date().toISOString(),
  });
}
