// The radius and the place as a bottom sheet (sheet 3-nearby/radius): five circles as tiles, each with its own icon,
// the chosen one lit, and a sixth tile that opens the place screen. Testids: radius-sheet, radius-<m>, radius-place.
import type { Radius } from "@sdk/client.ts";
import { say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { RADII, radiusWord } from "./feed-logic";

export const RADIUS_ICON: Record<Radius, string> = { 100: "r100", 300: "r300", 1000: "r1k", 3000: "r3k", 10000: "r10k" };

// the badges' colours, as radius.html has them
const COLOUR: Record<Radius, string> = { 100: "2", 300: "2", 1000: "2", 3000: "1", 10000: "6" };

export const radiusText = (r: Radius): string => {
  const w = radiusWord(r);
  return say(w.key, { n: w.n });
};

export function RadiusSheet({ radius, onPick, onPlace }: { radius: Radius; onPick: (r: Radius) => void; onPlace?: () => void }) {
  return (
    <div className="k-stack" data-testid="radius-sheet">
      <h2 className="k-sheet-title">{say("web.feed.radius")}</h2>
      <ul className="k-picks">
        {RADII.map((r) => (
          <li key={r}>
            <button type="button" className="k-pick" aria-pressed={r === radius} onClick={() => onPick(r)} data-testid={`radius-${r}`}>
              <span className="k-badge" data-c={COLOUR[r]}><NdIcon name={RADIUS_ICON[r]} /></span><span>{radiusText(r)}</span>
            </button>
          </li>
        ))}
        {onPlace && (
          <li>
            <button type="button" className="k-pick" onClick={onPlace} data-testid="radius-place"><span className="k-badge" data-c="2"><NdIcon name="place" /></span><span>{say("app.feed.place")}</span></button>
          </li>
        )}
      </ul>
    </div>
  );
}
