// Screen 19 in the web face (G2; the terminal's §4.9): the table as the node
// gives it, open to the node and said so, whose turn and how long, the score,
// the lines since one's own seating. The first class drawn is dots (G1c): a
// free edge is a button; the node keeps the rules.

import { useCallback, useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { dotsOf, freeEdges, openApplications, type TableView, Tables, turnOf } from "../../../depth/core/tables.ts";
import { say } from "../api/me.ts";
import { tableRefusal } from "../api/tables.ts";

const CELL = 48, PAD = 16;

function DotsBoard({ view, onEdge }: { view: TableView; onEdge?: (edge: string) => void }) {
  const dots = dotsOf(view.board)!;
  const free = new Set(freeEdges(dots));
  const size = dots.n * CELL + PAD * 2;
  const edges: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
  for (let r = 0; r <= dots.n; r++) {
    for (let c = 0; c < dots.n; c++) {
      edges.push({ id: `h:${r}:${c}`, x1: PAD + c * CELL, y1: PAD + r * CELL, x2: PAD + (c + 1) * CELL, y2: PAD + r * CELL });
    }
  }
  for (let r = 0; r < dots.n; r++) {
    for (let c = 0; c <= dots.n; c++) {
      edges.push({ id: `v:${r}:${c}`, x1: PAD + c * CELL, y1: PAD + r * CELL, x2: PAD + c * CELL, y2: PAD + (r + 1) * CELL });
    }
  }
  return (
    <svg width={size} height={size} role="group" aria-label={say("table.board")} data-testid="dots">
      {Object.entries(dots.boxes).map(([box, seat]) => {
        const [r, c] = box.split(":").map(Number);
        return <text key={box} x={PAD + c * CELL + CELL / 2} y={PAD + r * CELL + CELL / 2 + 5} textAnchor="middle">{seat}</text>;
      })}
      {edges.map((e) => free.has(e.id)
        ? (
          <line key={e.id} {...e} stroke="currentColor" strokeOpacity={onEdge ? 0.15 : 0.05} strokeWidth={10}
            role={onEdge ? "button" : undefined} aria-label={onEdge ? `${say("table.move")} ${e.id}` : undefined}
            data-edge={e.id} tabIndex={onEdge ? 0 : undefined} style={{ cursor: onEdge ? "pointer" : "default" }}
            onClick={onEdge ? () => onEdge(e.id) : undefined}
            onKeyDown={onEdge ? (k) => (k.key === "Enter" || k.key === " ") && onEdge(e.id) : undefined} />
        )
        : <line key={e.id} {...e} stroke="currentColor" strokeWidth={3} data-taken={e.id} />)}
      {Array.from({ length: (dots.n + 1) ** 2 }, (_, i) => (
        <circle key={i} cx={PAD + (i % (dots.n + 1)) * CELL} cy={PAD + Math.floor(i / (dots.n + 1)) * CELL} r={3} />
      ))}
    </svg>
  );
}

export function Table({ client, tableId, onLeave }: { client: Client; tableId: string; onLeave: () => void }) {
  const [tables] = useState(() => new Tables(client));
  const [view, setView] = useState<TableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState("");
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    // A read that throws (locked, no network) is said, not dropped.
    try {
      const answer = await tables.view(tableId);
      if (answer.status === 200) setView(answer.body);
      else setError(tableRefusal(answer));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tables, tableId]);

  // No socket for tables yet (ticket is spec): the view is read every 2 s,
  // and the clock ticks between reads.
  useEffect(() => {
    void load();
    const reading = setInterval(load, 2000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => { clearInterval(reading); clearInterval(clock); };
  }, [load]);

  async function act(run: () => Promise<{ status: number; body: unknown }>) {
    setError(null);
    try {
      const refused = tableRefusal(await run() as never);
      if (refused) setError(refused);
    } catch (e) {
      setError((e as Error).message);
    }
    await load();
  }

  if (!view) return <main className="table"><p>{error ?? "…"}</p></main>;
  const turn = turnOf(view);
  const board = view.board;
  const nameOf = (seat: number) => view.seats.find((s) => s.seat === seat)?.name ?? `#${seat}`;
  const score = board ? view.seats.filter((s) => board.score[String(s.seat)] !== undefined) : [];

  return (
    <main className="table" data-testid="table">
      <header>
        <h1>{say("table.title")}{view.name ? ` · «${view.name}»` : ""} · {view.class}</h1>
        <p>{say("table.playing")} {view.playing} · {say("table.watching")} {view.watching} · ♥ {view.like_count ?? 0}</p>
        <p>{say("table.seated")}: {view.seats.map((s) => (s.seat === view.seat ? say("table.you") : s.name)).join(" · ")}</p>
        <p role="note">{say("table.open")}</p>
      </header>
      {!board || board.over
        ? <p data-testid="over">{say("table.over")}</p>
        : board.turn === null ? <p data-testid="turn">{say("table.notStarted")}</p>
        : <p data-testid="turn">{turn.mine ? say("table.yourTurn") : `${say("table.turn")}: ${turn.name ?? "—"}`} · {turn.secondsLeft} {say("table.seconds")}</p>}
      {score.length > 0 && <p data-testid="score">{say("table.score")}: {score.map((s) => `${s.name} ${board!.score[String(s.seat)]}`).join(" · ")}</p>}
      {dotsOf(board) && (
        <DotsBoard view={view} onEdge={turn.mine ? (edge) => act(() => tables.move(tableId, board!.seq, { edge })) : undefined} />
      )}
      {error && <p role="alert">{error}</p>}
      <ul className="lines">
        {view.lines.filter((l) => l.kind !== "move").map((l) => (
          <li key={l.id}>{nameOf(l.seat)} — {l.kind === "sticker" ? `[${l.sticker}]` : l.text}</li>
        ))}
        {openApplications(view).map((l) => <li key={`w${l.id}`} className="application">{say("table.application")}: {nameOf(l.seat)}</li>)}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); const text = line.trim(); if (text) void act(() => tables.say(tableId, { kind: "line", text })).then(() => setLine("")); }}>
        <input value={line} maxLength={128} onChange={(e) => setLine(e.target.value)} aria-label={say("table.say")} />
        <button type="submit">{say("table.say")}</button>
      </form>
      <nav>
        {turn.mine && board && <button onClick={() => act(() => tables.pass(tableId, board.seq))}>{say("table.pass")}</button>}
        {view.is_playing && board && !board.over && <button onClick={() => act(() => tables.resign(tableId))}>{say("table.resign")}</button>}
        <button onClick={() => act(() => tables.like(tableId))}>{say("table.like")}</button>
        <button onClick={() => act(async () => { const answer = await tables.stand(tableId); if (answer.status < 400) onLeave(); return answer; })}>{say("table.stand")}</button>
      </nav>
    </main>
  );
}
