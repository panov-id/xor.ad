import { useLogin } from "@refinedev/core";
import { useState } from "react";

// Email-based magic link: the relay emails a one-time sign-in link, and only
// whoever controls that inbox can use it — the link lands on /auth/callback,
// which exchanges the token for a session JWT. Access is invite-only; the relay
// answers identically for unknown emails so membership never leaks.
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
        <form onSubmit={onSubmit} className="form-stack">
          <div className="field">
            {/* Named by a label, not by a placeholder: the placeholder leaves as
                soon as anyone types, and it was the field's only accessible name. */}
            <label className="field-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="button-primary" disabled={isPending}>
              Send sign-in link
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
