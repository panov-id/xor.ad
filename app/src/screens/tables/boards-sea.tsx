// Battleship (sheet w3_table-battleship): the other's sea on the panel — a hundred cells, a hit is a peach cell with a dark
// dot, a sunk ship peach, a miss a small light dot; a tap on a free cell in my turn is the shot ({shot}). Before the shots
// each seat places the whole fleet at once, dealt by the app and shuffled at will ({fleet}); my own sea stands beside it on the panel.
// Testids: sea-two, sea, shot-<id>, fleet-grid, sea-shuffle, sea-fleet-go; sea-own, own-<id>.
import { useSyncExternalStore } from "react";
import { seaOf, seaView } from "../../../../depth/core/tables_sea.ts";
import { say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import type { BoardProps } from "./boards";
import { InFoot } from "./foot-slot";
import { canShoot, ownCells, shotCells } from "./sea-logic";
import { fleetGrid, fleetSizes, randomFleet } from "./sea-place";
import { placingStore } from "./fleet-store";

// The fleet being placed is shared: the board draws it, the strip under the panel shuffles it and sends it (fleet-store.ts).
const placing = placingStore(randomFleet);
const setFleet = placing.set;
const usePlacing = () => useSyncExternalStore(placing.subscribe, placing.get);

// only mounted while placing, so the store deals afresh when a placing begins
function FleetGrid() {
  const fleet = usePlacing();
  return (
    <div className="tg-fleet-grid" role="img" aria-label={say("web.table.fleet")} data-testid="fleet-grid">
      {fleetGrid(fleet).map((c) => <span key={c.id} data-ship={c.ship ?? undefined} data-l={c.join.l || undefined} data-r={c.join.r || undefined} data-u={c.join.u || undefined} data-d={c.join.d || undefined} />)}
    </div>
  );
}

export function SeaBoard({ state, seat, onMove }: BoardProps) {
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
              <FleetGrid />
            </>
          )}
      </div>
    );
  }
  // battleship-turn: both seas on the panel side by side, bottom-aligned — the other's (shots) 86 units wide, mine 52
  return (
    <div className="tg-sea-two" data-testid="sea-two">
      <div className="tg-sea" role="group" aria-label={say("web.table.sea_theirs")} data-testid="sea" data-phase="shoot">
        {shotCells(v).map((c) => (
          <button key={c.id} type="button" className="tg-shot" data-result={c.result ?? undefined} data-join={c.join || undefined} disabled={!canShoot(v, c, !!onMove)} onClick={() => onMove?.({ shot: c.id })}
            aria-label={c.result ? say(`web.table.shot_${c.result}`, { cell: c.id }) : say("web.table.shoot", { cell: c.id })} data-testid={`shot-${c.id}`}>
            {(c.result === "hit" || c.result === "sunk") && <span className="tg-mark" data-testid="mark" />}
          </button>
        ))}
      </div>
      {v.ships && <OwnSea cells={ownCells(v)} />}
    </div>
  );
}

// My sea, small, beside the other's: my ships as bars, a cross where the other's shot hit one, a dot where it found water.
function OwnSea({ cells }: { cells: ReturnType<typeof ownCells> }) {
  return (
    <div className="tg-sea-own" role="group" aria-label={say("web.table.sea_mine")} data-testid="sea-own">
      {cells.map((c) => (
        <span key={c.id} className="tg-own" data-ship={c.ship || undefined} data-shot={c.shot ?? undefined}
          data-l={c.join.l || undefined} data-r={c.join.r || undefined} data-u={c.join.u || undefined} data-d={c.join.d || undefined}
          aria-label={c.shot ? say(`web.table.shot_${c.shot}`, { cell: c.id }) : c.ship ? say("web.table.my_ship", { cell: c.id }) : undefined} data-testid={`own-${c.id}`} />
      ))}
    </div>
  );
}

// Under the panel, while I place my fleet (battleship-place): its own panel with the fleet's ships by size (4, 3, 2, 1) and
// «shuffle» at the end, then «Fleet ready» in the foot. Nothing in the shots: my sea is on the panel beside the other's.
export function SeaUnder({ state, seat, onMove }: BoardProps) {
  const sea = seaOf(state as Record<string, unknown> | null);
  const v = sea && seaView(sea, seat, !!onMove);
  if (!v || v.phase !== "place" || v.ships) return null;
  return <PlaceStrip onMove={onMove} />;
}

// only mounted while placing, as FleetGrid is
function PlaceStrip({ onMove }: Pick<BoardProps, "onMove">) {
  const fleet = usePlacing();
  return (
    <>
      <div className="tg-fleet-strip" data-testid="fleet-strip">
        {fleetSizes().map((n) => <span key={n} className="tg-fleet-chip" data-size={n} aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>)}
        <button type="button" className="k-tb-key" disabled={!onMove} aria-label={say("app.sea.shuffle")} onClick={() => setFleet(randomFleet())} data-testid="sea-shuffle"><NdIcon name="rematch" /></button>
      </div>
      <InFoot>
        <div className="k-row tg-fleet-acts">
          <button type="button" className="k-cta" disabled={!onMove} onClick={() => onMove?.({ fleet })} data-testid="sea-fleet-go"><NdIcon name="check" /><span>{say("web.table.fleet_set")}</span></button>
        </div>
      </InFoot>
    </>
  );
}
