import { AuthProvider } from "@refinedev/core";
import { api, clearToken, getToken } from "./api";
import type { Permission, Role } from "../access";

// Passwordless: the login form asks the relay to email a one-time magic link.
// Following it hits /auth/callback (see pages/auth-callback), which exchanges the
// token for a session JWT stored in localStorage. Access is invite-only; the
// relay answers identically for unknown emails so membership never leaks.

export interface PanelIdentity {
  id: string;
  email: string;
  role: Role;
  // Which tenant this operator belongs to; null means a platform operator, who
  // sees every brand. The relay decides it — the panel only displays it.
  brand: string | null;
  permissions: Permission[];
}

// The session is immutable for its lifetime, so /auth/me is asked once and the
// in-flight promise is shared by every caller (check, identity, permissions, and
// every access check the UI runs). Dropped on logout and on any 401/403.
//
// Only an answer is kept: the identity, or a refusal (401, 403). A 5xx, a 429
// or a dropped connection says nothing about the session — it is asked again
// twice, and if the relay is still not answering, the next caller asks anew.
// Keeping such a failure signed the operator out for the rest of the tab
// (providers/auth.test.ts).
let identityRequest: Promise<PanelIdentity | null> | null = null;

const ATTEMPTS = 3;
const PAUSE_MS = 400;

async function askIdentity(): Promise<PanelIdentity | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await api("/auth/me");
      if (response.ok) return (await response.json()) as PanelIdentity;
      if (response.status === 401 || response.status === 403) return null;
    } catch {
      // A dropped connection: asked again below, like a 5xx.
    }
    if (attempt === ATTEMPTS) {
      identityRequest = null;
      return null;
    }
    await new Promise((done) => setTimeout(done, PAUSE_MS * attempt));
  }
}

export function loadIdentity(): Promise<PanelIdentity | null> {
  identityRequest ??= askIdentity();
  return identityRequest;
}

export function forgetIdentity(): void {
  identityRequest = null;
}

const authProvider: AuthProvider = {
  login: async ({ email }) => {
    await api("/auth/request-link", { method: "POST", body: JSON.stringify({ email }) });
    return {
      success: true,
      successNotification: {
        message: "Check your email",
        description: `If ${email} has panel access, a sign-in link is on its way.`,
      },
    };
  },

  logout: async () => {
    clearToken();
    forgetIdentity();
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    if (!getToken()) {
      return { authenticated: false, logout: true, redirectTo: "/login" };
    }
    if (!await loadIdentity()) {
      clearToken();
      forgetIdentity();
      return { authenticated: false, logout: true, redirectTo: "/login" };
    }
    return { authenticated: true };
  },

  onError: async (error) => {
    const status = (error as { statusCode?: number; status?: number })?.statusCode
      ?? (error as { status?: number })?.status;
    if (status === 401 || status === 403) {
      clearToken();
      forgetIdentity();
      return { logout: true, redirectTo: "/login", error };
    }
    return { error };
  },

  getPermissions: async () => (await loadIdentity())?.permissions ?? [],

  getIdentity: async () => {
    const identity = await loadIdentity();
    return identity ? { ...identity, name: identity.email } : null;
  },
};

export default authProvider;
