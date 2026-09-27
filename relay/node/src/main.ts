// Edge node — identical Deno image on every VPS in the pool. v1 serves the
// landing backend (waitlist / client-error / welcome). The chat relay slot is
// stubbed (see chat/relay.ts) so the node is chat-ready without chat code.

import { assertConfig, config } from "./config.ts";
import { log } from "./lib/log.ts";
import { closeAllRooms } from "./chat/relay.ts";
import { startWorker } from "./lib/jobs.ts";
import { armScheduledJobs, startRearming, registerScheduledJobs } from "./lib/scheduled.ts";
import { dispatch } from "./dispatch.ts";
import { hitsWritten, loadRateLimits } from "./lib/rate_limit.ts";

assertConfig();

// The address limits as the last day left them, before the first request
// (db/074): a restarted container used to start every address from nought.
try {
  const hits = await loadRateLimits();
  log("info", "rate-limit hits read back", { hits });
} catch (error) {
  log("warn", "rate-limit hits could not be read; the address limits start from nought", { error: String(error) });
}

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
    Deno.addSignalListener(signal, async () => {
      const closed = closeAllRooms();
      log("info", "stopping: rooms closed with 1001", { signal, closed });
      // The hits of the last moments, so the next start reads them; bounded,
      // because a database that hangs must not hold the stop.
      await Promise.race([hitsWritten(), new Promise((done) => setTimeout(done, 2000))]);
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
