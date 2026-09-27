// A new table (W10; G1h; POST /tables): a class, its set, how many seats and a
// name nobody has to give — at the person's own spot and circle, as a phrase
// goes. The node checks the rest (the seats a class allows, the name's queue).

import { useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { type BoardClass, Tables } from "../../../depth/core/tables.ts";
import { tableRefusal } from "../api/tables.ts";
import { say } from "../locales/say.ts";

// The sets each class knows (relay/node/src/lib/tables_*.ts) and the most
// seats it takes (routes/tables.ts).
export const CLASSES: Array<{ value: BoardClass; sets: string[]; most: number }> = [
  { value: "dots", sets: ["3x3", "2x2", "4x4"], most: 2 },
  { value: "grid", sets: ["checkers", "chess"], most: 2 },
  { value: "deck", sets: ["36"], most: 6 },
  { value: "word", sets: ["ru"], most: 2 },
  { value: "dice", sets: ["backgammon"], most: 2 },
  { value: "free", sets: ["double-six"], most: 4 },
  { value: "physics", sets: ["chapayev"], most: 4 },
];

export function NewTable({ client, at, radius, onMade, onBack }: {
  client: Client;
  at: { lat: number; lon: number };
  radius: Radius;
  onMade: (id: string) => void;
  onBack: () => void;
}) {
  const [kind, setKind] = useState<BoardClass>("dots");
  const chosen = CLASSES.find((c) => c.value === kind)!;
  const [set, setSet] = useState(chosen.sets[0]);
  const [seats, setSeats] = useState(2);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const made = await new Tables(client).create({
        class: kind, set, seats, lat: at.lat, lon: at.lon, area_radius: radius,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      if (made.status === 201) return onMade(made.body.id);
      setError(tableRefusal(made) ?? `${made.status}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen new-table" data-screen="new-table">
      <header><h1>{say("web.newTable.title")}</h1></header>
      <label>
        {say("web.newTable.class")}
        <select value={kind} onChange={(e) => {
          const next = CLASSES.find((c) => c.value === e.target.value)!;
          setKind(next.value);
          setSet(next.sets[0]);
          setSeats(Math.min(seats, next.most));
        }} data-testid="new-table-class">
          {CLASSES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
        </select>
      </label>
      <label>
        {say("web.newTable.set")}
        <select value={set} onChange={(e) => setSet(e.target.value)} data-testid="new-table-set">
          {chosen.sets.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>
        {say("web.newTable.seats")}
        <select value={seats} onChange={(e) => setSeats(Number(e.target.value))} data-testid="new-table-seats">
          {Array.from({ length: chosen.most - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>
        {say("web.newTable.name")}
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-testid="new-table-name" />
      </label>
      <p className="muted">{say("table.open")}</p>
      {error && <p className="error" data-testid="error">{error}</p>}
      <button type="button" className="primary" disabled={busy} onClick={() => void make()} data-testid="new-table-go">{say("web.newTable.go")}</button>
      <button type="button" onClick={onBack} data-testid="new-table-back">{say("common.back")}</button>
    </main>
  );
}
