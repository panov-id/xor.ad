import { AuthProvider } from "@refinedev/core";
import { supabaseClient } from "./supabase-client";

const authProvider: AuthProvider = {
  // Passwordless: a magic link is emailed, following it signs the user in.
  // No password field is used anywhere in the panel.
  login: async ({ email }) => {
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
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
  // Role comes from panel_users, not Supabase's own auth role — "admin"/
  // "moderator" is our app-level permission, not a Postgres/Supabase role.
  getPermissions: async () => {
    const { data } = await supabaseClient.auth.getUser();
    if (!data?.user) return null;

    const { data: row } = await supabaseClient
      .from("panel_users")
      .select("role")
      .eq("id", data.user.id)
      .single();

    return row?.role ?? null;
  },
  getIdentity: async () => {
    const { data } = await supabaseClient.auth.getUser();
    if (!data?.user) return null;

    const { data: row } = await supabaseClient
      .from("panel_users")
      .select("role")
      .eq("id", data.user.id)
      .single();

    return {
      ...data.user,
      name: data.user.email,
      role: row?.role ?? null,
    };
  },
};

export default authProvider;
