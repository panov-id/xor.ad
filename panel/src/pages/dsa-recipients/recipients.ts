// What the page reads from GET /admin/dsa-recipients and the two things it
// derives: the six months shown, counted or not, and the text that is copied.

export interface Recipients {
  months: { month: string; active: number }[];
  average: number | null;
  complete: boolean;
  method: string;
}

// The six calendar months before `now`, newest first, as YYYY-MM; a month the
// node has no row for is shown as not counted rather than left out.
export function monthsBack(
  months: Recipients["months"],
  now = new Date(),
): { month: string; active: number | null }[] {
  const byMonth = new Map(months.map((m) => [m.month.slice(0, 7), m.active]));
  const out: { month: string; active: number | null }[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, active: byMonth.get(key) ?? null });
  }
  return out;
}

// The figure as it is published, with its method — and, while fewer than six
// months are counted, the mark that says so.
export function recipientsText(r: Recipients): string {
  const figure = r.average === null ? "no figure yet" : String(r.average);
  const mark = r.complete ? "" : ` (incomplete: ${r.months.length} of 6 months counted)`;
  return `Average monthly active recipients, DSA Art. 24(3): ${figure}${mark}. Method: ${r.method}.`;
}
