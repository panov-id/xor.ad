// The pauses between resends of a line the node did not store (chat spec
// :2388; W14-RS): at once, then 5 s, 15 s, 45 s, 135 s — growing ×3 — and no
// more than about ten minutes apart from then on. The count belongs to one
// local_id and lives with the sender; every resend carries the same local_id,
// so the node keeps one row (relay routes/chats.ts: ON CONFLICT DO NOTHING).

export const RESEND_FIRST_MS = 5_000;
export const RESEND_FACTOR = 3;
export const RESEND_CAP_MS = 10 * 60_000;

// The wait before resend number `tries` (0 is the first resend after the
// failure, which goes at once).
export function resendPause(tries: number): number {
  if (!Number.isFinite(tries) || tries <= 0) return 0;
  return Math.min(RESEND_CAP_MS, RESEND_FIRST_MS * RESEND_FACTOR ** (tries - 1));
}
