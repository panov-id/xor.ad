import {
  type TreeMenuItem,
  useCan,
  useGetIdentity,
  useLogout,
  useMenu,
  usePermissions,
} from "@refinedev/core";
import { useState } from "react";
import { NavLink } from "react-router";
import type { PanelIdentity } from "../../providers/auth";
import { ThemeToggle } from "../theme-toggle";

// One item, one access check. Refine's useMenu is not assumed to filter by
// permissions — the check here is explicit, so what the menu shows and what the
// routes allow come from the same provider.
const MenuItem = ({ item, onNavigate }: { item: TreeMenuItem; onNavigate: () => void }) => {
  const { data } = useCan({ resource: item.name, action: "list" });
  if (!data?.can) return null;
  return (
    <li>
      {/* Following a link on a phone closes the menu: leaving it open would hide
          the page the reader just asked for. */}
      <NavLink to={item.route ?? "/"} onClick={onNavigate}>{item.label}</NavLink>
    </li>
  );
};

export const Menu = () => {
  const [open, setOpen] = useState(false);
  const { mutate: logout } = useLogout();
  const { menuItems } = useMenu();
  // Only used to tell "still loading" from "genuinely nothing to show", so the
  // menu is not briefly empty on the first render after sign-in.
  const { isLoading: permissionsLoading } = usePermissions({});
  // Whose operator this session belongs to — the platform, or one tenant.
  const { data: identity } = useGetIdentity<PanelIdentity>();

  return (
    <nav className="menu">
      {identity && (
        // A bare "platform" at the top of a sidebar reads as a title, not as the
        // answer to "whose data am I looking at" — so it says what it is.
        <p className="menu-scope">
          <span className="menu-scope-label">Signed in for</span>
          <span className="menu-scope-value">{identity.brand ?? "platform"}</span>
        </p>
      )}
      {/* Only ever visible on a narrow screen, where the menu would otherwise own
          the whole first view. On a desktop the CSS hides the button and the
          collapsible is always open, so there is one markup for both. */}
      <button
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close menu" : "Menu"}
      </button>

      <div className="menu-collapsible" data-open={open}>
        <ul>
          {permissionsLoading
            ? <li className="loading-note">Loading…</li>
            : menuItems.map((item) => (
              <MenuItem key={item.key} item={item} onNavigate={() => setOpen(false)} />
            ))}
        </ul>
        {/* Everything above sits together; only these two are pushed down, so the
            sidebar no longer has a hole in the middle. */}
        <span className="menu-spacer" />
        <ThemeToggle />
        <button onClick={() => logout()}>Logout</button>
      </div>
    </nav>
  );
};
