import { describe, expect, it } from "vitest";
import type { PanelIdentity } from "../../providers/auth";
import { showsBrandSwitcher } from "./switcher";

const who = (brand: string | null, permissions: string[]) =>
  ({ id: "o1", email: "o@x", role: "moderator", brand, permissions }) as unknown as PanelIdentity;

describe("showsBrandSwitcher", () => {
  it("shows it to a platform operator who may read brands", () => {
    expect(showsBrandSwitcher(who(null, ["brands.read", "logs.read"]), false)).toBe(true);
  });
  it("hides it from a platform moderator without brands.read: /admin/brands would answer 403", () => {
    expect(showsBrandSwitcher(who(null, ["logs.read"]), false)).toBe(false);
  });
  it("hides it from a brand operator even with brands.read", () => {
    expect(showsBrandSwitcher(who("sosed", ["brands.read"]), false)).toBe(false);
  });
  it("hides it on a fixed scope and before the identity is known", () => {
    expect(showsBrandSwitcher(who(null, ["brands.read"]), true)).toBe(false);
    expect(showsBrandSwitcher(undefined, false)).toBe(false);
  });
});
