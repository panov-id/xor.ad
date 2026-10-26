import type { PanelIdentity } from "../../providers/auth";

// The brand switcher lists brands from /admin/brands, which the relay guards
// with "brands.read". A platform moderator has brand null but not that right:
// asking would only earn a 403 (crowd finding 4, 24.10.2026). So the switcher
// is shown to a platform operator who may read brands, and only off a fixed scope.
export function showsBrandSwitcher(identity: PanelIdentity | undefined, singleScope: boolean): boolean {
  if (!identity || singleScope) return false;
  return identity.brand === null && identity.permissions.includes("brands.read");
}
