// w4_age-filter ("Who you see"): two handles by the year inside one's own band (depth/core/me.ts ageBand); for an
// adult the band's top is open and the handle at the track's end means "no limit". The sheet has no Save: a
// change is sent once the handles rest (SAVE_MS), PATCH /identities/me filter_age_min/max as the web's AgeFilter
// sends it. Two real range inputs over the drawn track (keyboard and screen reader as any slider).
// Testids (the web's): filter-from, filter-to, filter-range; error.
import { useEffect, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, say } from "../../i18n";
import { profileLine } from "./EditName";
import { along, filterPatch, filterRange, moveHandle, noTop, type Range } from "./me-logic";
import { ErrorLine, SubPage } from "./parts";

export const SAVE_MS = 600;

export function AgeFilter({ client, age, min, max, onBack }: { client: Client; age: number; min?: number | null; max?: number | null; onBack: () => void }) {
  const [r, setR] = useState<Range>(() => filterRange(age, min, max));
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(JSON.stringify(filterPatch(r)));
  useEffect(() => {
    const patch = filterPatch(r);
    if (JSON.stringify(patch) === sent.current) return;
    const t = setTimeout(() => {
      sent.current = JSON.stringify(patch);
      client.editProfile(patch)
        .then((answer) => setError(answer.status === 200 || answer.status === 202 ? null : profileLine(answer)))
        .catch((e: Error) => setError(failedLine(e)));
    }, SAVE_MS);
    return () => clearTimeout(t);
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = noTop(r) ? say("web.filter.noLimit") : String(r.to);
  return (
    <SubPage name="age-filter" title={say("web.filter.title")} onBack={onBack}>
      <h2 className="me-title">{say("app.filter.title")}</h2>
      <p className="me-lead" data-testid="filter-range">{noTop(r) ? say("app.filter.band_open", { from: r.from }) : say("app.filter.band", { from: r.from, to: r.to })}</p>
      <div className="me-filter" style={{ ["--a" as string]: along(r, r.from), ["--b" as string]: along(r, r.to) }}>
        <p className="me-ends" aria-hidden="true"><span>{r.from}</span><span>{noTop(r) ? "∞" : r.to}</span></p>
        <div className="me-track">
          <span className="me-fill" aria-hidden="true" />
          <span className="me-knob" data-k="a" aria-hidden="true" />
          <span className="me-knob" data-k="b" aria-hidden="true" />
          <input type="range" min={r.min} max={r.max} step={1} value={r.from} aria-label={say("app.filter.from")} aria-valuetext={String(r.from)}
            onChange={(e) => setR((was) => moveHandle(was, "from", Number(e.target.value)))} data-testid="filter-from" />
          <input type="range" min={r.min} max={r.max} step={1} value={r.to} aria-label={say("app.filter.to")} aria-valuetext={top}
            onChange={(e) => setR((was) => moveHandle(was, "to", Number(e.target.value)))} data-testid="filter-to" />
        </div>
        {r.open && <p className="me-quiet me-filter-note">{say("app.filter.open_note", { n: r.min })}</p>}
      </div>
      <ErrorLine text={error} />
    </SubPage>
  );
}
