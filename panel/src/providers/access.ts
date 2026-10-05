// Access control for the UI: one lookup in the resource map, one membership test
// against the permissions the relay expanded for this session. The panel never
// reasons about roles here — only about permissions.

import { AccessControlProvider } from "@refinedev/core";
import { requiredPermission } from "../access";
import { loadIdentity } from "./auth";

// Pages whose figure is the platform's: a tenant reader is not shown the menu
// item at all (owner, W17-DR), and the node refuses it with 403 besides.
const PLATFORM_ONLY = new Set(["dsa_recipients"]);

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    if (!resource) return { can: false, reason: "no resource given" };
    const permission = requiredPermission(resource, action);
    // Unmapped pairs are denied: a page added without a permission decision must
    // fail visibly rather than open itself to everyone.
    if (!permission) {
      return { can: false, reason: `no permission mapped for ${resource}.${action}` };
    }
    const identity = await loadIdentity();
    if (PLATFORM_ONLY.has(resource) && identity?.brand) return { can: false, reason: "the platform's, not a tenant's" };
    return { can: identity?.permissions.includes(permission) ?? false };
  },
};
