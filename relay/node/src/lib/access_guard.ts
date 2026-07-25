// Route-level access guard — resolves the caller from the session and checks one
// permission. Lives outside access/ by design: the core knows nothing about HTTP,
// and http.ts knows nothing about authentication.

import { can, type Permission } from "../access/index.ts";
import { authed, type PanelUser } from "./auth.ts";
import { json } from "./http.ts";

// Either the caller or the response to return instead. A union rather than a
// nullable Response so the actor cannot be mistaken for a passed check.
//
// A denied result still carries the caller when there was one: a 403 is exactly
// the kind of event the audit trail wants attributed. A 401 has nobody to name.
export type AccessResult =
  | { user: PanelUser }
  | { response: Response; user?: PanelUser };

// 401 when unauthenticated, 403 when authenticated but under-privileged.
export async function requirePermission(
  req: Request,
  permission: Permission,
): Promise<AccessResult> {
  const user = await authed(req);
  if (!user) return { response: json({ error: "unauthorized" }, 401) };
  if (!can(user, permission)) return { response: json({ error: "forbidden" }, 403), user };
  return { user };
}

export function isDenied(
  result: AccessResult,
): result is { response: Response; user?: PanelUser } {
  return "response" in result;
}
