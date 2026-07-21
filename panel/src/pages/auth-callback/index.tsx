import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api, setToken } from "../../providers/api";

// Landing for the emailed magic link: /auth/callback?token=… . Exchanges the
// one-time token for a session JWT via the relay, stores it, and enters the panel.
export const AuthCallback = () => {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFailed(true);
      return;
    }
    api(`/auth/callback?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("invalid");
        const { token: jwt } = await res.json();
        setToken(jwt);
        navigate("/", { replace: true });
      })
      .catch(() => setFailed(true));
  }, [navigate]);

  return (
    <div className="auth-wrap">
      <h1>
        xor<span className="dot">.</span>ad panel
      </h1>
      {failed ? (
        <p className="auth-note">
          This sign-in link is invalid or has expired. <a href="/login">Back to login</a>
        </p>
      ) : (
        <p className="auth-note">Signing you in…</p>
      )}
    </div>
  );
};
