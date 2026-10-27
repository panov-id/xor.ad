// w4_age-filter ("Who you see"): two handles by the year inside one's own band (depth/core/me.ts ageBand); for an
// adult the band's top is open and the handle at the track's end means "no limit". The sheet has no Save: a
// change is sent once the handles rest (SAVE_MS), PATCH /identities/me filter_age_min/max as the web's AgeFilter
// sends it. Two real range inputs over the drawn track (keyboard and screen reader as any slider).
// Testids (the web's): filter-from, filter-to, filter-range; error.
import { useEffect, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
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
  function saveNow() {
    const patch = filterPatch(r);
    if (JSON.stringify(patch) === sent.current) return;
    sent.current = JSON.stringify(patch);
    client.editProfile(patch)
      .then((answer) => setError(answer.status === 200 || answer.status === 202 ? null : profileLine(answer)))
      .catch((e: Error) => setError(failedLine(e)));
  }
  // the prototype's age-filter.html: the mark and the band big, the track, the note card; the Save at the foot sends at once
  return (
    <SubPage name="age-filter" title={say("web.filter.title")} onBack={onBack} panelClass="k-me-panel"
      foot={<button type="button" className="cta cta-primary" onClick={saveNow} data-testid="filter-save"><NdIcon name="check" /><span>{say("app.filter.save")}</span></button>}>
      <h2 className="k-sr">{say("app.filter.title")}</h2>
      <div className="k-row k-me-hero">
        <NdIcon name="alone" className="k-big-icon k-48" />
        <span className="k-me-value" aria-hidden="true">{r.from}{" – "}{noTop(r) ? "∞" : r.to}</span>
      </div>
      <div className="k-range" style={{ ["--a" as string]: along(r, r.from), ["--b" as string]: along(r, r.to) }}>
        <div className="k-track">
          <span className="k-track-fill" aria-hidden="true" />
          <span className="k-knob" data-k="a" aria-hidden="true" />
          <span className="k-knob" data-k="b" aria-hidden="true" />
          <input type="range" min={r.min} max={r.max} step={1} value={r.from} aria-label={say("app.filter.from")} aria-valuetext={String(r.from)}
            onChange={(e) => setR((was) => moveHandle(was, "from", Number(e.target.value)))} data-testid="filter-from" />
          <input type="range" min={r.min} max={r.max} step={1} value={r.to} aria-label={say("app.filter.to")} aria-valuetext={top}
            onChange={(e) => setR((was) => moveHandle(was, "to", Number(e.target.value)))} data-testid="filter-to" />
        </div>
      </div>
      <div className="k-note k-me-note" role="status"><NdIcon name="info" />
        <div className="k-stack k-gap7">
          <span data-testid="filter-range">{noTop(r) ? say("app.filter.band_open", { from: r.from }) : say("app.filter.band", { from: r.from, to: r.to })}</span>
          {r.open && <span>{say("app.filter.open_note", { n: r.min })}</span>}
        </div>
      </div>
      <ErrorLine text={error} />
    </SubPage>
  );
}
