// Which permission each Refine resource/action pair requires.
//
// Deny by default: a pair missing from this map is inaccessible. Adding a page
// without deciding its permission then fails visibly (nobody can open it)
// instead of silently exposing it to every role.

import type { Permission } from "./permissions";

export const PERMISSION_BY_RESOURCE_ACTION: Record<string, Permission> = {
  "waitlist.list": "waitlist.read",
  "panel_users.list": "panel_users.read",
  "panel_users.create": "panel_users.write",
  "panel_users.edit": "panel_users.write",
  "panel_users.delete": "panel_users.write",
  // Registered ahead of the log pages (phases 4-6) so they arrive already gated.
  "logs_client_errors.list": "logs.client_errors.read",
  "logs_audit.list": "logs.audit.read",
  "logs_server.list": "logs.server.read",
  "logs_pageviews.list": "logs.pageviews.read",
  "api_keys.list": "api_keys.read",
  "api_keys.create": "api_keys.write",
  // Same permission as the publishable ones: an operator trusted to hand out one
  // kind of key is trusted with the other.
  "secret_keys.list": "api_keys.read",
  "secret_keys.create": "api_keys.write",
  "brands.list": "brands.read",
  "brands.create": "brands.write",
  // Registered late, and the page was unreachable until it was: App.tsx routed
  // dsa_notices and wrapped it in Gated, but with no pair here deny-by-default
  // refused every role, admin included. The screen existed and nobody could open
  // it. The test below now walks App.tsx so the next omission fails in CI.
  "dsa_notices.list": "dsa_notices.read",
};

export function requiredPermission(resource: string, action: string): Permission | undefined {
  return PERMISSION_BY_RESOURCE_ACTION[`${resource}.${action}`];
}
