import { AuthProvider } from "@refinedev/core";
import { supabaseClient } from "./supabase-client";

// Loads the current user together with their panel role. Role comes from
// panel_users, not Supabase's own auth role — "admin"/"moderator" is our
// app-level permission. A null role means the user is authenticated but is
// not a panel member (no invite), so they must not enter the panel.
const loadPanelUser = async (): Promise<{
  user: Awaited<ReturnType<typeof supabaseClient.auth.getUser>>["data"]["user"];
  role: string | null;
}> => {
  const { data } = await supabaseClient.auth.getUser();
  const user = data?.user ?? null;
  if (!user) return { user: null, role: null };

  const { data: row } = await supabaseClient
    .from("panel_users")
    .select("role")
    .eq("id", user.id)
    .single();

  return { user, role: row?.role ?? null };
};

const authProvider: AuthProvider = {
  // Passwordless: a magic link is emailed, following it signs the user in.
  // No password field is used anywhere in the panel. NOTE: SMTP is still a
  // placeholder, so no email is actually delivered yet — see the login page
  // comment and docs/panel_EN.md.
  login: async ({ email }) => {
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          // Panel access is invite-only: never create a new auth user from a
          // login attempt. Only already-invited users can request a link.
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        // shouldCreateUser:false makes Supabase reject unknown emails. Do not
        // surface that as a distinct error — it would let anyone probe which
        // emails are panel users. Answer identically to a real send.
        const status = (error as { status?: number }).status;
        if (status === 422 || /signups?\s+not\s+allowed/i.test(error.message)) {
          return {
            success: true,
            successNotification: {
              message: "Check your email",
              description: `If ${email} has panel access, a sign-in link is on its way.`,
            },
          };
        }
        return {
          success: false,
          error,
        };
      }

      return {
        success: true,
        successNotification: {
          message: "Check your email",
          description: `We sent a sign-in link to ${email}.`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error,
      };
    }
  },
  // No self-registration and no passwords: panel access is invite-only,
  // handled by the invite-panel-user Edge Function.
  logout: async () => {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: true,
      redirectTo: "/",
    };
  },
  onError: async (error) => {
    console.error(error);
    // An expired/revoked session surfaces as 401/403 on data calls — sign the
    // user out and send them to login instead of leaving a broken session.
    const status = (error as { statusCode?: number; status?: number })?.statusCode
      ?? (error as { status?: number })?.status;
    if (status === 401 || status === 403) {
      return { logout: true, redirectTo: "/login", error };
    }
    return { error };
  },
  check: async () => {
    try {
      const { data } = await supabaseClient.auth.getSession();
      const { session } = data;

      if (!session) {
        return {
          authenticated: false,
          error: {
            message: "Check failed",
            name: "Session not found",
          },
          logout: true,
          redirectTo: "/login",
        };
      }

      // A valid session is not enough: anyone can obtain one via OTP. Only
      // invited panel_users may enter the panel, so require a panel role.
      const { role } = await loadPanelUser();
      if (!role) {
        return {
          authenticated: false,
          error: {
            message: "This account has no panel access",
            name: "Not a panel user",
          },
          logout: true,
          redirectTo: "/login",
        };
      }
    } catch (error: any) {
      return {
        authenticated: false,
        error: error || {
          message: "Check failed",
          name: "Not authenticated",
        },
        logout: true,
        redirectTo: "/login",
      };
    }

    return {
      authenticated: true,
    };
  },
  getPermissions: async () => {
    const { role } = await loadPanelUser();
    return role;
  },
  getIdentity: async () => {
    const { user, role } = await loadPanelUser();
    if (!user) return null;

    return {
      ...user,
      name: user.email,
      role,
    };
  },
};

export default authProvider;
