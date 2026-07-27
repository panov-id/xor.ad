import {
  type TreeMenuItem,
  useCan,
  useGetIdentity,
  useLogout,
  useMenu,
  usePermissions,
} from "@refinedev/core";
import { NavLink } from "react-router";
import type { PanelIdentity } from "../../providers/auth";
import { ThemeToggle } from "../theme-toggle";

// One item, one access check. Refine's useMenu is not assumed to filter by
// permissions — the check here is explicit, so what the menu shows and what the
// routes allow come from the same provider.
const MenuItem = ({ item }: { item: TreeMenuItem }) => {
  const { data } = useCan({ resource: item.name, action: "list" });
  if (!data?.can) return null;
  return (
    <li>
      <NavLink to={item.route ?? "/"}>{item.label}</NavLink>
    </li>
  );
};

export const Menu = () => {
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
      <ul>
        {permissionsLoading
          ? <li className="loading-note">Loading…</li>
          : menuItems.map((item) => <MenuItem key={item.key} item={item} />)}
      </ul>
      {/* Everything above sits together; only these two are pushed down, so the
          sidebar no longer has a hole in the middle. */}
      <span className="menu-spacer" />
      <ThemeToggle />
      <button onClick={() => logout()}>Logout</button>
    </nav>
  );
};
