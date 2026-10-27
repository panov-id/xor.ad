// Battleship (sheet w3_table-battleship): the other's sea on the panel — a hundred cells, a hit is a peach cell with a dark
// dot, a sunk ship peach, a miss a small light dot; a tap on a free cell in my turn is the shot ({shot}). Before the shots
// each seat places the whole fleet at once, dealt by the app and shuffled at will ({fleet}); my own sea stands under the panel.
// Testids: sea, shot-<id>, fleet-grid, sea-shuffle, sea-fleet-go; sea-own, own-<id>.
import { useState } from "react";
import { seaOf, seaView } from "../../../../depth/core/tables_sea.ts";
import { say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import type { BoardProps } from "./boards";
import { InFoot } from "./foot-slot";
import { canShoot, ownCells, shotCells } from "./sea-logic";
import { fleetGrid, randomFleet } from "./sea-place";

export function SeaBoard({ state, seat, onMove }: BoardProps) {
  const [fleet, setFleet] = useState(() => randomFleet());
  const sea = seaOf(state as Record<string, unknown> | null);
  const v = sea && seaView(sea, seat, !!onMove);
  if (!v) return null;
  if (v.phase === "place") {
    return (
      <div className="tg-sea tg-place" data-testid="sea" data-phase="place">
        {v.ships
          ? <p className="tb-quiet" data-testid="fleet-waiting">{say("web.table.fleet_waiting")}</p>
          : (
            // battleship-place (owner 27.10.2026): the app places the fleet on the grid, «shuffle» deals another, «Fleet ready» sends it
            <>
              <div className="tg-fleet-grid" role="img" aria-label={say("web.table.fleet")} data-testid="fleet-grid">
                {fleetGrid(fleet).map((c) => <span key={c.id} data-ship={c.ship ?? undefined} data-l={c.join.l || undefined} data-r={c.join.r || undefined} data-u={c.join.u || undefined} data-d={c.join.d || undefined} />)}
              </div>
              <InFoot>
                <div className="k-row tg-fleet-acts">
                  <button type="button" className="k-tb-key" disabled={!onMove} aria-label={say("app.sea.shuffle")} onClick={() => setFleet(randomFleet())} data-testid="sea-shuffle"><NdIcon name="rematch" /></button>
                  <button type="button" className="k-cta" disabled={!onMove} onClick={() => onMove?.({ fleet })} data-testid="sea-fleet-go"><NdIcon name="check" /><span>{say("web.table.fleet_set")}</span></button>
                </div>
              </InFoot>
            </>
          )}
      </div>
    );
  }
  return (
    <div className="tg-sea" role="group" aria-label={say("web.table.sea_theirs")} data-testid="sea" data-phase="shoot">
      {shotCells(v).map((c) => (
        <button key={c.id} type="button" className="tg-shot" data-result={c.result ?? undefined} data-join={c.join || undefined} disabled={!canShoot(v, c, !!onMove)} onClick={() => onMove?.({ shot: c.id })}
          aria-label={c.result ? say(`web.table.shot_${c.result}`, { cell: c.id }) : say("web.table.shoot", { cell: c.id })} data-testid={`shot-${c.id}`}>
          {c.result === "hit" && <span className="tg-mark" data-testid="mark" />}
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
    <div className="tg-sea-own" role="group" aria-label={say("web.table.sea_mine")} data-testid="sea-own">
      {ownCells(v).map((c) => (
        <span key={c.id} className="tg-own" data-ship={c.ship || undefined} data-shot={c.shot ?? undefined}
          aria-label={c.shot ? say(`web.table.shot_${c.shot}`, { cell: c.id }) : c.ship ? say("web.table.my_ship", { cell: c.id }) : undefined} data-testid={`own-${c.id}`} />
      ))}
    </div>
  );
}
