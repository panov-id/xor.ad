// Access control for the UI: one lookup in the resource map, one membership test
// against the permissions the relay expanded for this session. The panel never
// reasons about roles here — only about permissions.

import { AccessControlProvider } from "@refinedev/core";
import { requiredPermission } from "../access";
import { loadIdentity } from "./auth";

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
    return { can: identity?.permissions.includes(permission) ?? false };
  },
};
