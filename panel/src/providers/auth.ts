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
  permissions: Permission[];
}

// The session is immutable for its lifetime, so /auth/me is asked once and the
// in-flight promise is shared by every caller (check, identity, permissions, and
// every access check the UI runs). Dropped on logout and on any 401/403.
let identityRequest: Promise<PanelIdentity | null> | null = null;

export function loadIdentity(): Promise<PanelIdentity | null> {
  identityRequest ??= api("/auth/me")
    .then((response) => (response.ok ? (response.json() as Promise<PanelIdentity>) : null))
    .catch(() => null);
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
