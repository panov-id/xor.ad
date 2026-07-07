import { useLogin } from "@refinedev/core";
import { useState } from "react";

// Email-based magic link: Supabase emails a one-time sign-in link, and only
// whoever controls that inbox can use it. This is what actually proves
// "it's you" — unlike generating a link and handing it back over HTTP to
// whoever asked, which we tried and rejected (see docs/panel).
//
// NOTE: this requires a real SMTP provider, which is still a placeholder —
// no emails go out yet, so self-service login does not work end-to-end.
// Panel access today is bootstrapped via the invite-panel-user function.
// See docs/panel_EN.md ("Self-service sign-in") and supabase/.env.
export const LoginPage = () => {
  const { mutate: login, isPending } = useLogin();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(
      { email },
      {
        onSuccess: (result) => {
          if (result?.success) setSent(true);
        },
      },
    );
  };

  return (
    <div className="auth-wrap">
      <h1>
        xor<span className="dot">.</span>ad panel
      </h1>
      {sent ? (
        <p className="auth-note">
          Check <strong>{email}</strong> for a sign-in link.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="auth-form">
          <input
            type="email"
            placeholder="your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={isPending}>
            Send sign-in link
          </button>
        </form>
      )}
    </div>
  );
};
