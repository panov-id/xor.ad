// The age filter in "me" (W14-AF; chat spec §8.2 :1485-1489, the terminal's
// mock docs/depth-client_RU.md:519): two handles by the year, inside one's
// own band — a handle does not go past it — and for an adult the right edge
// reads «без ограничения». The node takes any min <= max within the band
// (PATCH /identities/me filter_age_min/max) and says filter_out_of_band
// otherwise; GET /identities/me gives the current pair when one is set.

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { profileRefusal, say } from "../api/me.ts";
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";

// The band, as the node draws it (relay/node/src/lib/feed_geo.ts band):
// up to 20 — [max(13, A-2), A+2]; from 21 — [min(21, A-2), no limit].
export function ageBand(age: number): { low: number; high: number | null } {
  if (age <= 20) return { low: Math.max(13, age - 2), high: age + 2 };
  return { low: Math.min(21, age - 2), high: null };
}

// The adult's right handle needs an end to slide to: its last step is
// «без ограничения», sent as null.
const OPEN_END = 99;

type Read = { age: number; filter_age_min?: number; filter_age_max?: number };

export function AgeFilter({ client, onDone, onBack }: { client: Client; onDone: () => void; onBack: () => void }) {
  const [age, setAge] = useState<number | null>(null);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // filter_age_* ride on GET /identities/me only while set (relay
    // routes/identity.ts); the core's Profile type does not name them.
    client.profile()
      .then((p) => {
        const r = p as unknown as Read;
        const band = ageBand(r.age);
        setAge(r.age);
        setFrom(r.filter_age_min ?? band.low);
        setTo(r.filter_age_max ?? band.high ?? OPEN_END);
      })
      .catch((e: Error) => setRefused(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (age === null) {
    return (
      <main className="screen age-filter" data-screen="age-filter">
        <HeaderScreen title={say("web.filter.title")} />
        {refused ? <p className="error" data-testid="error">{refused}</p> : <p className="muted">…</p>}
        <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="filter-back" />
      </main>
    );
  }
  const band = ageBand(age);
  const top = band.high ?? OPEN_END;
  const open = band.high === null && to >= OPEN_END;
  const toWords = open ? say("web.filter.noLimit") : String(to);
  async function save() {
    setBusy(true);
    setRefused(null);
    try {
      const answer = await client.editProfile({ filter_age_min: from, filter_age_max: open ? null : to });
      if (answer.status === 200 || answer.status === 202) return onDone();
      setRefused(profileRefusal(answer) ?? `the filter was refused: ${answer.status}`);
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="screen age-filter" data-screen="age-filter" data-from={from} data-to={open ? "open" : to}>
      <HeaderScreen title={say("web.filter.title")} />
      <p className="muted">{say("web.filter.hint")}</p>
      <label>
        {say("web.filter.from")}
        <input
          type="range" min={band.low} max={top} step={1} value={from}
          aria-valuetext={String(from)}
          onChange={(e) => { const v = Number(e.target.value); setFrom(v); if (v > to) setTo(v); }}
          data-testid="filter-from"
        />
      </label>
      <label>
        {say("web.filter.to")}
        <input
          type="range" min={band.low} max={top} step={1} value={to}
          aria-valuetext={toWords}
          onChange={(e) => { const v = Number(e.target.value); setTo(v); if (v < from) setFrom(v); }}
          data-testid="filter-to"
        />
      </label>
      <p data-testid="filter-range">{from} — {toWords}</p>
      {refused && <p className="error" data-testid="error">{refused}</p>}
      <Button type="button" kind="primary" icon="check" className="ui-wide" aria-label={say("me.save")} aria-busy={busy} disabled={busy} onClick={() => void save()} data-testid="filter-save" />
      <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="filter-back" />
    </main>
  );
}
