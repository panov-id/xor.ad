// Signups, newest first. On the shared table like every other list — before, this
// page had a hand-written one, which is how its brand badge ended up drawn in the
// colour reserved for errors.

import { useList } from "@refinedev/core";
import { Badge } from "../../components/badge";
import { DataTable } from "../../components/data-table";
import { EmptyState } from "../../components/states";

type WaitlistRow = {
  id: string;
  email: string;
  source: string;
  brand: string | null;
  early_access: boolean;
  created_at: string;
};

export const WaitlistList = () => {
  // Refine v5 hook shape: { result: { data, total }, query: { isLoading } }.
  const { result, query } = useList<WaitlistRow>({
    resource: "waitlist",
    sorters: [{ field: "created_at", order: "desc" }],
    pagination: { pageSize: 100 },
  });

  return (
    <div className="panel-card">
      <h1>Waitlist</h1>
      <DataTable<WaitlistRow>
        columns={[
          { key: "email", label: "Email" },
          {
            key: "brand",
            label: "Brand",
            // The brand is a stored field decided by the relay, so the panel stops
            // guessing it from the signup source; source is only the fallback for
            // rows written before tenancy.
            render: (row) => <Badge>{row.brand ?? row.source ?? "—"}</Badge>,
          },
          {
            key: "created_at",
            label: "Signed up",
            render: (row) => new Date(row.created_at).toLocaleString(),
          },
        ]}
        rows={result?.data ?? []}
        rowId={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? "Loading the waitlist failed." : null}
        onRetry={() => void query.refetch()}
        caption="Waitlist signups"
        empty={
          <EmptyState
            title="No signups yet."
            hint="A landing writes here the moment someone submits the form."
          />
        }
      />
    </div>
  );
};
