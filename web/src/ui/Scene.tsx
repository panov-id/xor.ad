// The feed header's eight scenes (web/design/comic-2026-10-01.svg, «ШАПКА
// ЛЕНТЫ ПО ВРЕМЕНИ СУТОК»): sosed's courtyard of panel blocks, neighbro's
// coast with palms, each at morning, day, sunset and night. Drawn at 375×200
// as in the mock; colours only from the comic schemes' --sky-*/--sc-* tokens.
// Decoration: aria-hidden, the title is the header's own h1 on top.
import type { ReactNode } from "react";
import type { Phase } from "./phase.ts";

const W = 375, H = 200;
const v = (name: string) => `var(--${name})`;
const PHASES: Phase[] = ["morning", "day", "sunset", "night"];

function sosed(k: number): ReactNode[] {
  const out: ReactNode[] = [];
  const bcol = [v("sc-bldg-morning"), v("sc-bldg-day"), v("sc-ink"), v("sc-bldg-night")][k];
  if (k === 3) out.push(<circle key="m" cx={290} cy={86} r={16} fill={v("sc-paper")} stroke={v("sc-ink")} strokeWidth={3} />,
    <circle key="m2" cx={297} cy={81} r={13} fill={v("sky-s-night-0")} />);
  if (k === 0) out.push(<circle key="s" cx={60} cy={150} r={34} fill={v("sc-sun-morning")} />);
  if (k === 2) out.push(<circle key="s" cx={300} cy={140} r={40} fill={v("sc-gold")} stroke={v("sc-ink")} strokeWidth={3} />);
  for (const [bx, bw, bh] of [[0, 70, 80], [64, 90, 105], [150, 60, 70], [206, 100, 95], [300, 80, 75]]) {
    out.push(<rect key={`b${bx}`} x={bx} y={H - bh} width={bw} height={bh} fill={bcol} stroke={v("sc-ink")} strokeWidth={k === 1 ? 3 : 0} />);
    for (let wy = H - bh + 10; wy < H - 8; wy += 14) {
      for (let wx = bx + 8; wx < bx + bw - 8; wx += 13) {
        if ((wx * 7 + wy * 3) % (k === 3 ? 5 : 9) !== 0) continue;
        const col = k >= 2 ? v("sc-gold") : k === 1 ? v("sc-win-day") : v("sc-win-morning");
        out.push(<rect key={`w${wx}-${wy}`} x={wx} y={wy} width={6} height={7} fill={col} />);
      }
    }
  }
  return out;
}

function neighbro(k: number): ReactNode[] {
  const out: ReactNode[] = [];
  if (k === 0) out.push(<circle key="s" cx={280} cy={150} r={34} fill={v("sc-peach")} stroke={v("sc-ink")} strokeWidth={3} />,
    <rect key="sea" x={0} y={150} width={W} height={50} fill={v("sc-sea-morning")} />);
  if (k === 1) out.push(<circle key="s" cx={230} cy={105} r={22} fill={v("sc-white")} stroke={v("sc-ink")} strokeWidth={3} />,
    <rect key="sea" x={0} y={140} width={W} height={34} fill={v("sc-sea")} />,
    <rect key="sand" x={0} y={174} width={W} height={26} fill={v("sc-sun-morning")} />);
  if (k === 2) {
    out.push(<circle key="s" cx={250} cy={150} r={56} fill={v("sc-gold")} />);
    for (let j = 0; j < 4; j++) out.push(<rect key={`r${j}`} x={190} y={132 + j * 12} width={120} height={5} fill={v("sc-stripe")} />);
    out.push(<rect key="sea" x={0} y={176} width={W} height={24} fill={v("sc-dusk")} />);
  }
  if (k === 3) out.push(<rect key="line" x={0} y={172} width={W} height={4} fill={v("sc-gold")} />,
    <rect key="sea" x={0} y={176} width={W} height={24} fill={v("sc-night-sea")} />);
  const pc = k < 3 ? v("sc-ink") : v("sc-night-sea");
  const strokes: [number, string][] = k === 3 ? [[10, v("sc-gold")], [7, pc]] : [[7, pc]];
  for (const [x0, ph] of [[40, 110], [330, 95]]) {
    for (const [sw, col] of strokes) {
      out.push(<path key={`t${x0}-${sw}`} d={`M${x0} ${H} Q${x0 + 8} ${H - ph / 2} ${x0 + 4} ${H - ph}`} stroke={col} strokeWidth={sw} fill="none" />);
      for (const ang of [-150, -110, -60, -20, 20]) {
        const t = (ang * Math.PI) / 180, ex = x0 + 4 + 40 * Math.cos(t), ey = H - ph + 40 * Math.sin(t) + 16;
        out.push(<path key={`f${x0}-${sw}-${ang}`} d={`M${x0 + 4} ${H - ph} Q${(x0 + 4 + ex) / 2} ${H - ph - 18} ${ex.toFixed(0)} ${ey.toFixed(0)}`}
          stroke={col} strokeWidth={sw + 1} fill="none" strokeLinecap="round" />);
      }
    }
  }
  return out;
}

export function Scene({ brand, phase }: { brand: string; phase: Phase }) {
  const k = PHASES.indexOf(phase);
  const b = brand === "neighbro" ? "n" : "s";
  const gid = `sky-${b}-${phase}`;
  return (
    <svg className="ui-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" data-scene={`${brand}-${phase}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".42" stopColor={v(`sky-${b}-${phase}-0`)} />
          <stop offset="1" stopColor={v(`sky-${b}-${phase}-1`)} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${gid})`} />
      {b === "n" ? neighbro(k) : sosed(k)}
    </svg>
  );
}

// The title's ink on that sky: dark by day, paper by sunset and night.
export const titleInk = (phase: Phase) => (phase === "morning" || phase === "day" ? "var(--sky-title-dark)" : "var(--sky-title-light)");
