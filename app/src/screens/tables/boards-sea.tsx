// Battleship (sheet w3_table-battleship): the other's sea on the panel — a hundred cells, a hit is a peach cell with a dark
// dot, a sunk ship peach, a miss a small light dot; a tap on a free cell in my turn is the shot ({shot}). Before the shots
// each seat places the whole fleet at once, typed as ships of cells ({fleet}); my own sea stands under the panel.
// Testids: sea, shot-<id>, sea-fleet-input, sea-fleet-go; sea-own, own-<id>.
import { useState } from "react";
import { FLEET_EXAMPLE, parseFleet, seaOf, seaView } from "../../../../depth/core/tables_sea.ts";
import { say } from "../../i18n";
import type { BoardProps } from "./boards";
import { canShoot, ownCells, shotCells } from "./sea-logic";

export function SeaBoard({ state, seat, onMove }: BoardProps) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const sea = seaOf(state as Record<string, unknown> | null);
  const v = sea && seaView(sea, seat, !!onMove);
  if (!v) return null;
  if (v.phase === "place") {
    return (
      <div className="tb-sea tb-place" data-testid="sea" data-phase="place">
        {v.ships
          ? <p className="tb-quiet" data-testid="fleet-waiting">{say("web.table.fleet_waiting")}</p>
          : (
            <form className="tb-fleet" onSubmit={(e) => { e.preventDefault(); const parsed = parseFleet(text); setBad(parsed === null); if (parsed) onMove?.({ fleet: parsed }); }}>
              <p className="tb-quiet" data-testid="fleet-hint">{say("web.table.fleet_hint", { example: FLEET_EXAMPLE })}</p>
              <input value={text} maxLength={200} disabled={!onMove} onChange={(e) => setText(e.target.value)} aria-label={say("web.table.fleet")} placeholder={FLEET_EXAMPLE} data-testid="sea-fleet-input" />
              {bad && <p className="me-error" role="alert" data-testid="fleet-bad">{say("web.table.fleet_bad")}</p>}
              <button type="submit" className="cta cta-primary" disabled={!onMove || !text.trim()} data-testid="sea-fleet-go">{say("web.table.fleet_set")}</button>
            </form>
          )}
      </div>
    );
  }
  return (
    <div className="tb-sea" role="group" aria-label={say("web.table.sea_theirs")} data-testid="sea" data-phase="shoot">
      {shotCells(v).map((c) => (
        <button key={c.id} type="button" className="tb-shot" data-result={c.result ?? undefined} data-join={c.join || undefined} disabled={!canShoot(v, c, !!onMove)} onClick={() => onMove?.({ shot: c.id })}
          aria-label={c.result ? say(`web.table.shot_${c.result}`, { cell: c.id }) : say("web.table.shoot", { cell: c.id })} data-testid={`shot-${c.id}`}>
          {c.result === "hit" && <span className="tb-mark" data-testid="mark" />}
        </button>
      ))}
    </div>
  );
}

// My sea, small, under the panel: my ships, and where the other's shots found them or the water.
export function SeaUnder({ state, seat }: BoardProps) {
  const sea = seaOf(state as Record<string, unknown> | null);
  const v = sea && seaView(sea, seat, false);
  if (!v || !v.ships) return null;
  return (
    <div className="tb-sea-own" role="group" aria-label={say("web.table.sea_mine")} data-testid="sea-own">
      {ownCells(v).map((c) => (
        <span key={c.id} className="tb-own" data-ship={c.ship || undefined} data-shot={c.shot ?? undefined}
          aria-label={c.shot ? say(`web.table.shot_${c.shot}`, { cell: c.id }) : c.ship ? say("web.table.my_ship", { cell: c.id }) : undefined} data-testid={`own-${c.id}`} />
      ))}
    </div>
  );
}
