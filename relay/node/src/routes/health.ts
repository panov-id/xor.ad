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
    // What a deploy asks about afterwards: not "does a node answer" but "is it
    // this build". Reported here rather than on a route of its own because the
    // balancer already polls this one and it costs nothing to add.
    image: config.imageTag,
    storage: storageEnabled(),
    storage_transport: config.storage.transport,
    mail: config.mail.transport,
    brands: config.brands.map((b) => b.key),
    ts: new Date().toISOString(),
  });
}
