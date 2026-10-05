import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelIdentity } from "./auth";

let who: PanelIdentity | null = null;
vi.mock("./auth", () => ({ loadIdentity: () => Promise.resolve(who) }));
const { accessControlProvider } = await import("./access");

const moderator = (brand: string | null): PanelIdentity => ({
  id: "m", email: "m@test.invalid", role: "moderator", brand, permissions: ["dsa_notices.read"],
});
const can = async (resource: string) => (await accessControlProvider.can({ resource, action: "list" })).can;

// W17-DR: the recipients figure is the platform's; a tenant has no menu item
// and no page (the owner's answer "a"), even holding the permission.
describe("platform-only pages", () => {
  beforeEach(() => { who = null; });

  it("open the recipients page to the platform's moderator", async () => {
    who = moderator(null);
    expect(await can("dsa_recipients")).toBe(true);
  });

  it("keep it from a tenant's moderator who holds the same permission", async () => {
    who = moderator("sosed");
    expect(await can("dsa_recipients")).toBe(false);
    // The tenant's own notices stay theirs to read.
    expect(await can("dsa_notices")).toBe(true);
  });

  it("keep it from a reader without the permission", async () => {
    who = { ...moderator(null), permissions: [] };
    expect(await can("dsa_recipients")).toBe(false);
  });
});
