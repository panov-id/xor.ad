// Which notices the platform has to decide itself.
//
// The queue endpoint returns everything a reader may see, and for a platform
// operator that is every tenant's notices at once. Correct — the platform
// examines what no tenant can — but until 2026-09-08 the screen offered no way
// to ask for its own, so "what is mine to decide" was answered by eye down two
// hundred rows, and a notice the platform alone could decide sat looking exactly
// like one already in a storefront's hands.
//
// `brand IS NULL` is the whole distinction, and it is reached two ways: the
// notice arrived with no usable key (db/007), or its copy belongs to a face
// other than the one it was filed through (db/015, 2026-09-07). Both are the
// platform's, and nothing else is.

import { describe, expect, it } from "vitest";
import { inQueue, type QueueFilter } from "./list";

const keyless = { brand: null };
const foreignCopy = { brand: null };
const tenants = { brand: "sosed" };

describe("the queue filter", () => {
  it("shows everything when nothing is asked of it", () => {
    for (const row of [keyless, foreignCopy, tenants]) {
      expect(inQueue(row, "all")).toBe(true);
    }
  });

  it("gives the platform exactly the notices no tenant can decide", () => {
    expect(inQueue(keyless, "platform")).toBe(true);
    expect(inQueue(foreignCopy, "platform")).toBe(true);
    expect(inQueue(tenants, "platform")).toBe(false);
  });

  it("and a storefront's queue is the rest of them", () => {
    expect(inQueue(tenants, "tenant")).toBe(true);
    expect(inQueue(keyless, "tenant")).toBe(false);
  });

  it("never drops a row: every notice is in exactly one of the two queues", () => {
    for (const row of [keyless, foreignCopy, tenants]) {
      const queues: QueueFilter[] = ["platform", "tenant"];
      expect(queues.filter((queue) => inQueue(row, queue))).toHaveLength(1);
    }
  });
});
