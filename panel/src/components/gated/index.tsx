// Route-level gate. Three states, never two: while the permissions are in flight
// the page is neither shown nor refused — showing "no access" during the first
// render after sign-in would be a lie that resolves itself a moment later.

import type { ReactNode } from "react";
import { useCan } from "@refinedev/core";
import { Forbidden } from "../forbidden";

interface GatedProps {
  resource: string;
  action?: string;
  children: ReactNode;
}

export const Gated = ({ resource, action = "list", children }: GatedProps) => {
  const { data, isLoading } = useCan({ resource, action });

  if (isLoading) {
    return (
      <div className="panel-card">
        <p className="loading-note">Loading…</p>
      </div>
    );
  }
  return data?.can ? <>{children}</> : <Forbidden />;
};
