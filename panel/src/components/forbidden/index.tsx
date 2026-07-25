// Shown instead of a page the session's role does not reach — including when the
// URL was typed by hand, so route gating does not rely on the menu hiding links.
export const Forbidden = () => (
  <div className="panel-card">
    <h1>No access</h1>
    <p className="auth-note">
      Your role doesn't include this section. Ask an admin if you need it.
    </p>
  </div>
);
