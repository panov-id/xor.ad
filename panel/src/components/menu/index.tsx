import { type TreeMenuItem, useCan, useLogout, useMenu, usePermissions } from "@refinedev/core";
import { NavLink } from "react-router";

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

  return (
    <nav className="menu">
      <ul>
        {permissionsLoading
          ? <li className="loading-note">Loading…</li>
          : menuItems.map((item) => <MenuItem key={item.key} item={item} />)}
      </ul>
      <button onClick={() => logout()}>Logout</button>
    </nav>
  );
};
