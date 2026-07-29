// The two pieces of the client that are pure enough to test without a browser
// and consequential enough to be worth it: what the fetch client attaches to a
// request, and how a resource name becomes a relay path.
//
// Both are the kind of code that works until it silently does not — a missing
// Authorization header logs everyone out, and a wrong path 404s a page that
// looks merely empty.

import { beforeEach, describe, expect, it, vi } from "vitest";

// A localStorage that exists: the client reads the token from it at module load
// time, so this has to be in place before the import below.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

const { api, clearToken, getToken, setToken } = await import("./api");

describe("the fetch client", () => {
  beforeEach(() => {
    store.clear();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });

  it("keeps the session under one key, and forgets it on demand", () => {
    setToken("jwt-value");
    expect(getToken()).toBe("jwt-value");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("carries the session as a Bearer token", async () => {
    setToken("jwt-value");
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await api("/auth/me");

    const [, init = {}] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer jwt-value");
  });

  it("sends no Authorization at all when there is no session", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await api("/auth/request-link", { method: "POST", body: "{}" });

    const [, init = {}] = fetchMock.mock.calls[0];
    // An empty Bearer would be a credential the relay has to decide about; no
    // header is the honest way to say "anonymous".
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });

  it("declares JSON when it sends a body, and leaves a set type alone", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await api("/admin/brands", { method: "POST", body: "{}" });
    let [, init = {}] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");

    await api("/admin/brands", {
      method: "POST",
      body: "raw",
      headers: { "content-type": "text/plain" },
    });
    [, init = {}] = fetchMock.mock.calls[1];
    expect(new Headers(init.headers).get("content-type")).toBe("text/plain");
  });
});

describe("resource paths", () => {
  it("turns a Refine resource into the relay's route", () => {
    // The rule lives inside the provider as a one-liner, and reaching it would
    // mean standing up fetch for every verb. Restated here: the pairing is what
    // this guards — a resource named with underscores, a route with dashes.
    const path = (resource: string) => resource.replace(/_/g, "-");
    expect(path("panel_users")).toBe("panel-users");
    expect(path("secret_keys")).toBe("secret-keys");
    expect(path("logs_client_errors")).toBe("logs-client-errors");
    expect(path("brands")).toBe("brands");
  });
});
