import { AuthProvider } from "@refinedev/core";
import { api, clearToken, getToken } from "./api";

// Passwordless: the login form asks the relay to email a one-time magic link.
// Following it hits /auth/callback (see pages/auth-callback), which exchanges the
// token for a session JWT stored in localStorage. Access is invite-only; the
// relay answers identically for unknown emails so membership never leaks.
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
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    if (!getToken()) {
      return { authenticated: false, logout: true, redirectTo: "/login" };
    }
    const res = await api("/auth/me");
    if (!res.ok) {
      clearToken();
      return { authenticated: false, logout: true, redirectTo: "/login" };
    }
    return { authenticated: true };
  },

  onError: async (error) => {
    const status = (error as { statusCode?: number; status?: number })?.statusCode
      ?? (error as { status?: number })?.status;
    if (status === 401 || status === 403) {
      clearToken();
      return { logout: true, redirectTo: "/login", error };
    }
    return { error };
  },

  getPermissions: async () => {
    const res = await api("/auth/me");
    if (!res.ok) return null;
    return (await res.json()).role ?? null;
  },

  getIdentity: async () => {
    const res = await api("/auth/me");
    if (!res.ok) return null;
    const user = await res.json();
    return { ...user, name: user.email };
  },
};

export default authProvider;
