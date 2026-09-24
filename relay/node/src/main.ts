// Edge node — identical Deno image on every VPS in the pool. v1 serves the
// landing backend (waitlist / client-error / welcome). The chat relay slot is
// stubbed (see chat/relay.ts) so the node is chat-ready without chat code.

import { assertConfig, config } from "./config.ts";
import { log } from "./lib/log.ts";
import { closeAllRooms } from "./chat/relay.ts";
import { startWorker } from "./lib/jobs.ts";
import { armScheduledJobs, startRearming, registerScheduledJobs } from "./lib/scheduled.ts";
import { dispatch } from "./dispatch.ts";

assertConfig();

// Background work, if there is a database to hold it. Both calls are no-ops
// without one, so a stand with no Postgres behaves exactly as it did.
registerScheduledJobs();
startWorker();
armScheduledJobs().catch((error) =>
  log("error", "could not arm the scheduled jobs", { error: String(error) })
);
// And every hour after: a job that gave up comes back (watchdog С3).
startRearming();

// A stop is announced to every open room first: 1001, so the terminals come
// back on their own. The signal then ends the process as it would have.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  try {
    Deno.addSignalListener(signal, () => {
      const closed = closeAllRooms();
      log("info", "stopping: rooms closed with 1001", { signal, closed });
      Deno.exit(0);
    });
  } catch {
    // Not every platform has every signal; the server still runs.
  }
}

Deno.serve({ port: config.port, hostname: "0.0.0.0" }, (incoming, info) =>
  dispatch(incoming, info?.remoteAddr?.hostname)
);

log("info", "listening", { port: config.port, region: config.region });
