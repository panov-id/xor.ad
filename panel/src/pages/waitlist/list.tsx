import { useList } from "@refinedev/core";

type WaitlistRow = {
  id: string;
  email: string;
  source: string;
  brand: string | null;
  early_access: boolean;
  created_at: string;
};

// The brand is now a stored field decided by the relay, so the panel stops
// guessing it from the signup source; source is only the fallback for rows
// written before tenancy.
const brandBadge = (brand: string | null, source: string) => {
  const label = brand ?? source ?? "—";
  return <span className={`badge badge-${label}`}>{label}</span>;
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
      {query.isLoading ? (
        <p>Loading…</p>
      ) : (
        <table className="panel-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Brand</th>
              <th>Signed up</th>
            </tr>
          </thead>
          <tbody>
            {result?.data.map((row) => (
              <tr key={row.id}>
                <td>{row.email}</td>
                <td>{brandBadge(row.brand, row.source)}</td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
