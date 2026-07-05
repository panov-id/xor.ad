import { useLogin } from "@refinedev/core";
import { useState } from "react";

// Real email-based magic link: Supabase emails a one-time sign-in link,
// and only whoever controls that inbox can use it. This is what actually
// proves "it's you" — unlike generating a link and handing it back over
// HTTP to whoever asked, which we tried and rejected (see docs/panel).
// Requires a real SMTP provider to be configured (see supabase/.env).
export const LoginPage = () => {
  const { mutate: login, isLoading } = useLogin();
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
          <button type="submit" disabled={isLoading}>
            Send sign-in link
          </button>
        </form>
      )}
    </div>
  );
};
