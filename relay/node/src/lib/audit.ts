// Audit trail — who changed what in the panel, and who tried to.
//
// One object per event under audit/<env>/, the same collection shape as the other
// logs, so the log reader pages it without special-casing. Records are written,
// never updated or deleted: an audit trail that can be edited is not one.

import { config } from "../config.ts";
import { put, storageEnabled } from "./storage.ts";
import { log } from "./log.ts";
import type { PanelUser } from "./auth.ts";

export type AuditOutcome = "applied" | "denied";

export interface AuditEvent {
  at: string;
  actor_email: string;
  actor_role: string;
  // The tenant the actor was acting within; null for a platform operator. The
  // trail itself stays platform-wide — one journal, filtered per reader — so a
  // tenant cannot quietly drop its own record by owning the collection.
  actor_brand: string | null;
  action: string; // "panel_users.create" | "panel_users.role_change" | ...
  target: string | null;
  outcome: AuditOutcome;
  reason: string | null; // why a denied attempt was refused
  before: unknown; // null on create
  after: unknown; // null on delete
  node: string;
  env: string;
}

export const auditDir = (): string => `audit/${config.envName}`;

interface AuditInput {
  actor: Pick<PanelUser, "email" | "role" | "brand"> | null | undefined;
  action: string;
  target?: string | null;
  outcome?: AuditOutcome;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

// Fire-and-forget: a failed audit write must never break the operation it
// describes (same discipline as the client-error sink). The failure surfaces in
// the node's own stdout log rather than in the caller's response.
export function recordAuditEvent(input: AuditInput): void {
  if (!storageEnabled()) return;
  const event: AuditEvent = {
    at: new Date().toISOString(),
    // An unauthenticated caller never reaches an audited action, so a missing
    // actor means a bug upstream — recorded, not hidden behind a plausible name.
    actor_email: input.actor?.email ?? "unknown",
    actor_role: input.actor?.role ?? "unknown",
    actor_brand: input.actor?.brand ?? null,
    action: input.action,
    target: input.target ?? null,
    outcome: input.outcome ?? "applied",
    reason: input.reason ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    node: config.nodeId,
    env: config.envName,
  };
  put(`${auditDir()}/${crypto.randomUUID()}.json`, event)
    .catch((error) =>
      log("error", "audit write failed", { action: event.action, error: String(error) })
    );
}
