// The year of a support request (chat spec §13: "a year from created_at";
// the storefronts' privacy policy: "A support message: 1 year"). Before
// 2026-09-22 the promise had no executor — the open item support.sweeper.
//
// Daily, in batches so a backlog does not hold one long transaction.
//
// The team's daily digest (§13) is here too: per storefront, the number of new
// requests in the day, of those still waiting for an answer, and — separately —
// of those written from a frozen session (a possible takeover), with no text of
// any request. It goes to each storefront's support@<domain>; the brand was put
// on the row for it (db/039, the owner's decision of 2026-09-22). A request
// without a brand — sent with no storefront's key — is in no one's digest.

import { queryOrThrow } from "./db.ts";
import { inc } from "./metrics.ts";
import { log } from "./log.ts";
import { sendSupportDigest, withoutAddresses } from "./mailer.ts";

const BATCH = 1000;
const MAX_BATCHES = 100;

export interface DigestLine {
  brand: string;
  new: number;
  waiting: number;
  frozen: number;
  // Watchdog С3: jobs that gave up, other than prune_dsa_records (it has its
  // own urgent letter). The same for every face: the queue is the node's.
  tombstones?: { kind: string; count: number }[];
}

// The day's counts per storefront; only storefronts with something to say.
export async function supportDigest(): Promise<DigestLine[]> {
  const rows = await queryOrThrow<{ brand: string; new: number; waiting: number; frozen: number }>(
    `SELECT brand,
            count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS new,
            count(*) FILTER (WHERE answer IS NULL)::int AS waiting,
            count(*) FILTER (WHERE from_frozen AND created_at > now() - interval '1 day')::int AS frozen
       FROM support_requests
      WHERE brand IS NOT NULL
      GROUP BY brand
     HAVING count(*) FILTER (WHERE created_at > now() - interval '1 day') > 0
         OR count(*) FILTER (WHERE answer IS NULL) > 0
      ORDER BY brand`,
  );
  // Tombstones of the other jobs go in the same digest (docs/watchdogs_RU.md
  // С3; loop, 2026-09-24): a line in every face's letter, and a letter for
  // every face while there are any, even on a day with no requests.
  const tombstones = await queryOrThrow<{ kind: string; count: number }>(
    `SELECT kind, count(*)::int AS count FROM jobs
      WHERE locked_until = 'infinity' AND kind <> 'prune_dsa_records'
      GROUP BY kind ORDER BY kind`,
  );
  if (tombstones.length === 0) return rows;
  const faces = await queryOrThrow<{ key: string }>(`SELECT key FROM brands ORDER BY key`);
  const byBrand = new Map(rows.map((r) => [r.brand, r]));
  return faces.map((f) => ({
    ...(byBrand.get(f.key) ?? { brand: f.key, new: 0, waiting: 0, frozen: 0 }),
    tombstones: [...tombstones],
  }));
}

// Each storefront's line to its own support@<domain>. Best-effort: a failed
// letter is logged and counted, and the next day's digest carries the numbers
// again — nothing is lost that the table does not still hold.
export async function sendSupportDigests(): Promise<number> {
  let sent = 0;
  for (const line of await supportDigest()) {
    const [face] = await queryOrThrow<{ domain: string }>(`SELECT domain FROM brands WHERE key = $1`, [line.brand]);
    if (!face) continue;
    try {
      if (await sendSupportDigest(`support@${face.domain}`, line.brand, line)) sent++;
    } catch (error) {
      log("error", "support digest not sent", { brand: line.brand, error: withoutAddresses(String(error)) });
      inc("relay_support_digest_total", { result: "failed" });
    }
  }
  if (sent > 0) inc("relay_support_digest_total", { result: "sent" }, sent);
  return sent;
}

export async function sweepSupport(): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const [gone] = await queryOrThrow<{ n: string }>(
      `WITH doomed AS (
         SELECT id FROM support_requests
          WHERE created_at < now() - interval '1 year'
          ORDER BY created_at
          LIMIT ${BATCH}
       ), gone AS (
         DELETE FROM support_requests WHERE id IN (SELECT id FROM doomed) RETURNING id
       )
       SELECT count(*)::text AS n FROM gone`,
    );
    const n = Number(gone?.n ?? 0);
    total += n;
    if (n < BATCH) break;
  }
  if (total > 0) inc("relay_support_swept_total", {}, total);
  return total;
}
