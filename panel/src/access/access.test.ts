// The panel's own copy of the access rules — the map that decides which page a
// role may open. It is a duplicate of a decision the relay also makes, and that
// is the point of testing it: the relay refuses what it must, and this map only
// decides what to render. The failure it guards against is the quiet one — a
// page added without a permission, which the deny-by-default rule turns into
// "nobody can open it" rather than "everybody can".

import { describe, expect, it } from "vitest";
import { PERMISSION_BY_RESOURCE_ACTION, requiredPermission } from "./resources";
import { readFile } from "node:fs/promises";
import { PERMISSIONS } from "./permissions";

describe("resource map", () => {
  it("names only permissions that exist", () => {
    for (const [pair, permission] of Object.entries(PERMISSION_BY_RESOURCE_ACTION)) {
      expect(PERMISSIONS, `${pair} names an unknown permission`).toContain(permission);
    }
  });

  it("denies by default: an unmapped pair has no permission at all", () => {
    expect(requiredPermission("waitlist", "list")).toBe("waitlist.read");
    // Not "returns something safe" — returns nothing, so `Gated` renders the
    // forbidden state instead of guessing.
    expect(requiredPermission("waitlist", "delete")).toBeUndefined();
    expect(requiredPermission("invented", "list")).toBeUndefined();
  });

  // The omission this file's header promised to catch, and did not. Validating
  // the entries that exist says nothing about the page that was never entered:
  // dsa_notices was routed, gated and shipped with no pair here, so every role
  // was refused and the screen sat unreachable. Read the app's own resource list
  // instead of trusting that somebody remembered both files.
  it("maps every resource the app registers", async () => {
    const source = await readFile(new URL("../App.tsx", import.meta.url), "utf8");
    const registered = [...source.matchAll(/name:\s*"([^"]+)"[\s\S]{0,200}?list:\s*"/g)]
      .map((match) => match[1]);

    expect(registered.length, "found no resources in App.tsx — did the shape change?")
      .toBeGreaterThan(0);

    for (const resource of registered) {
      expect(
        requiredPermission(resource, "list"),
        `${resource} has a list route in App.tsx and no permission here, so nobody can open it`,
      ).toBeDefined();
    }
  });

  it("gives every list page a read permission and every write a write one", () => {
    for (const [pair, permission] of Object.entries(PERMISSION_BY_RESOURCE_ACTION)) {
      const action = pair.split(".").pop();
      if (action === "list") expect(permission, pair).toMatch(/\.read$/);
      if (action === "create" || action === "edit" || action === "delete") {
        expect(permission, pair).toMatch(/\.write$/);
      }
    }
  });
});

describe("the permission catalogue", () => {
  // The panel keeps its own copy of the strings because it renders a scope
  // picker from them. Two copies drift, and the drift is silent: today the relay
  // gained waitlist.write and this list did not, so the key page could not offer
  // the one scope the API needed. Reading the relay's file is not elegant; it is
  // the only thing that fails when they part.
  it("matches the relay's, string for string and in order", async () => {
    const source = await readFile(
      new URL("../../../relay/node/src/access/permissions.ts", import.meta.url),
      "utf8",
    );
    const block = source.slice(
      source.indexOf("export const PERMISSIONS = ["),
      source.indexOf("] as const;"),
    );
    const relay = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect([...PERMISSIONS]).toEqual(relay);
  });

  it("has no duplicates", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
});
