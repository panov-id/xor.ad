// A new table (W10; G1h; POST /tables): a class, its set, how many seats and a
// name nobody has to give — at the person's own spot and circle, as a phrase
// goes. The node checks the rest (the seats a class allows, the name's queue).

import { useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { type BoardClass, Tables } from "../../../depth/core/tables.ts";
import { classWord, setWord, tableRefusal } from "../api/tables.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { Field } from "../ui/Field.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Select } from "../ui/Select.tsx";

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
    <Screen name="new-table" title={say("web.newTable.title")} header={<HeaderScreen title={say("web.newTable.title")} onBack={onBack} backLabel={say("common.back")} />}>
      <Select label={say("web.newTable.class")} value={kind} testid="new-table-class"
        options={CLASSES.map((c) => ({ value: c.value, label: classWord(c.value) }))}
        onChange={(value) => {
          const next = CLASSES.find((c) => c.value === value)!;
          setKind(next.value);
          setSet(next.sets[0]);
          setSeats(Math.min(seats, next.most));
        }} />
      <Select label={say("web.newTable.set")} value={set} testid="new-table-set"
        options={chosen.sets.map((s) => ({ value: s, label: setWord(s) }))} onChange={setSet} />
      <Select label={say("web.newTable.seats")} value={String(seats)} testid="new-table-seats"
        options={Array.from({ length: chosen.most - 1 }, (_, i) => i + 2).map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(value) => setSeats(Number(value))} />
      <Field label={say("web.newTable.name")} value={name} maxLength={40} onChange={setName} data-testid="new-table-name" />
      <div className="ui-info-row"><Info label={say("web.newTable.title")} data-testid="new-table-info"><p>{say("table.open")}</p></Info></div>
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
      <Button kind="primary" type="button" icon="table" className="ui-wide" aria-label={say("web.newTable.go")} disabled={busy} onClick={() => void make()} data-testid="new-table-go" />
      <Button kind="secondary" type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="new-table-back" />
    </Screen>
  );
}
