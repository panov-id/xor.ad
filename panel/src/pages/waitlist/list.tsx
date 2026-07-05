import { useList } from "@refinedev/core";

type WaitlistRow = {
  id: string;
  email: string;
  source: string;
  early_access: boolean;
  created_at: string;
};

const siteBadge = (source: string) => {
  if (source.startsWith("sosed")) return <span className="badge badge-sosed">sosed.place</span>;
  if (source.startsWith("neighbro")) return <span className="badge badge-neighbro">neighbro.place</span>;
  return <span className="badge">{source}</span>;
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
              <th>Face</th>
              <th>Signed up</th>
            </tr>
          </thead>
          <tbody>
            {result?.data.map((row) => (
              <tr key={row.id}>
                <td>{row.email}</td>
                <td>{siteBadge(row.source)}</td>
                <td>{new Date(row.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
