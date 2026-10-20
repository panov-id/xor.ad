// A new table (W10; G1h; POST /tables), as the wizard of the sheets
// panel/design/adaptive-*-new-table-{game,variant,preview}-*.svg (13.10.2026,
// owner: «creating a table must be beautiful»): 1) a game by its card, 2) how
// you play — the variant, the seats and a name nobody has to give, 3) the table
// as neighbours will see it in the feed, and «sit at the table» makes it. Back
// on every step: the step before, from step 1 where the person came from. At
// the person's own spot and circle, as a phrase goes; the node checks the rest.

import { useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { type BoardClass, Tables } from "../../../depth/core/tables.ts";
import { GAMES, makeTableWords, seatsWord } from "../../../depth/core/new_table.ts";
import { classWord, tableRefusal } from "../api/tables.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Card, CardOpen, openerIds } from "../ui/Card.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { Field } from "../ui/Field.tsx";
import { GameArt } from "../ui/GameArt.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Segments } from "../ui/Segments.tsx";
import { Split } from "../ui/Split.tsx";
import { TileFoot } from "../ui/TileFoot.tsx";
import "./newTable.css";

// The sets each class knows (relay/node/src/lib/tables_*.ts) and the most
// seats it takes (routes/tables.ts). check-web-i18n reads the sets from here.
export const CLASSES: Array<{ value: BoardClass; sets: string[]; most: number }> = [
  { value: "dots", sets: ["3x3", "2x2", "4x4"], most: 2 },
  { value: "grid", sets: ["checkers", "chess", "reversi", "four", "battleship"], most: 2 },
  // "36" is durak podkidnoy, "transfer" durak perevodnoy (14.10.2026); "poker" is Texas hold'em on chips, no money (13.10.2026).
  { value: "deck", sets: ["36", "transfer", "poker"], most: 6 },
  // Hangman in each interface language (relay/node/src/lib/tables_word.ts ALPHABETS).
  { value: "word", sets: ["ru", "en", "uk", "be", "de", "es", "fr", "pl", "ro", "az", "uz", "el", "hy", "ka", "kk", "ky", "tg"], most: 2 },
  { value: "dice", sets: ["backgammon"], most: 2 },
  { value: "free", sets: ["double-six"], most: 4 },
  { value: "physics", sets: ["chapayev"], most: 4 },
];

// The twelve games of step 1 (GAMES, in the sheets' order) and what each is called live in depth/core/new_table.ts,
// shared with the app; the sets each class knows are listed above for check-web-i18n.
const { gameName, variantWord } = makeTableWords(say);

export function NewTable({ client, at, radius, onMade, onBack }: {
  client: Client;
  at: { lat: number; lon: number };
  radius: Radius;
  onMade: (id: string) => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(1);
  const [game, setGame] = useState(GAMES[0]);
  const [set, setSet] = useState(GAMES[0].sets[0]);
  const [seats, setSeats] = useState(2);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(id: string) {
    const next = GAMES.find((g) => g.id === id)!;
    setGame(next);
    setSet(next.sets[0]);
    setSeats(next.seats[0]);
    setError(null);
    setStep(2);
  }

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const made = await new Tables(client).create({
        class: game.klass, set, seats, lat: at.lat, lon: at.lon, area_radius: radius,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      if (made.status === 201) return onMade(made.body.id);
      setError(tableRefusal(made) ?? `${made.status}`);
      // A refused name is mended where the name is typed: back to step 2.
      if ((made.body as { error?: { code?: string } })?.error?.code === "name_refused") setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = say("web.newTable.title");
  const what = say(step === 1 ? "web.newTable.pick" : step === 2 ? "web.newTable.how" : "web.newTable.see");
  const where = say("web.newTable.step", { n: step, what });
  return (
    <Screen name="new-table" title={title} data-step={step} header={
      <HeaderScreen title={title} onBack={step === 1 ? onBack : () => setStep(step - 1)} backLabel={say("common.back")} backTestid="new-table-back"
        action={
          <span data-part="strip" role="img" aria-label={where} data-testid="new-table-step" data-step={step}>
            {[1, 2, 3].map((n) => <span key={n} data-on={n <= step ? "" : undefined} />)}
          </span>
        } />
    }>
      <p data-part="where" aria-hidden="true">{where}</p>

      {step === 1 && (
        <ul data-part="games" data-testid="new-table-games">
          {GAMES.map((g) => (
            <Card as="li" key={g.id} kind="nested" data-part="game">
              <CardOpen id={`game-${g.id}`} onOpen={() => pick(g.id)} testid={`new-table-game-${g.id}`} />
              <GameArt game={g.id} />
              <span data-part="name" id={openerIds(`game-${g.id}`).text}>{gameName(g)}</span>
              <span data-part="seats" id={openerIds(`game-${g.id}`).foot} aria-label={say("web.newTable.players", { n: seatsWord(g.seats) })}>
                <Icon name="player" className="ui-glyph" />{seatsWord(g.seats)}
              </span>
            </Card>
          ))}
        </ul>
      )}

      {step === 2 && (
        <>
          <div data-part="chosen" data-testid="new-table-chosen">
            <GameArt game={game.id} size={112} />
            <span data-part="name">{gameName(game)}</span>
            <span data-part="seats" aria-label={say("web.newTable.players", { n: seatsWord(game.seats) })}><Icon name="player" className="ui-glyph" />{seatsWord(game.seats)}</span>
          </div>
          <Segments label={say("web.newTable.variant")} value={set} onChange={setSet} testid="new-table-set"
            options={game.sets.map((s) => ({ value: s, label: variantWord(game.id, s), testid: `new-table-set-${s}`, ...(game.klass === "word" ? { lang: s } : {}) }))} />
          <Segments label={say("web.newTable.seats")} value={String(seats)} onChange={(v) => setSeats(Number(v))} testid="new-table-seats"
            options={game.seats.map((n) => ({ value: String(n), label: String(n), testid: `new-table-seats-${n}` }))} />
          {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
          <div data-part="name-field">
            <Field label={say("web.newTable.name")} value={name} maxLength={24} onChange={setName} data-testid="new-table-name" />
          </div>
          <div data-part="foot">
            <Split><Button kind="primary" type="button" icon="open" aria-label={say("web.newTable.next")} onClick={() => setStep(3)} data-testid="new-table-next" /></Split>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          {/* The table among the feed (sheet adaptive-*-new-table-preview-393): a neighbour's phrase, faint, above it. */}
          <div data-part="ghost" aria-hidden="true" />
          <section data-part="preview" data-testid="new-table-preview" aria-label={say("web.newTable.see")}>
            <GameArt game={game.id} size={120} />
            <div data-part="what">
              <p data-part="name">{name.trim() || gameName(game)}</p>
              <p data-part="kind">{say("table.title")} · {classWord(game.klass)} · {variantWord(game.id, set)}</p>
            </div>
            <div data-part="tiles">
              <TileFoot items={[
                { icon: "player", n: 1, label: `${say("table.playing")} 1` },
                { icon: "eye", n: 0, label: `${say("table.watching")} 0` },
                { icon: "seat", n: seats - 1, label: say("web.feed.tableFree", { n: seats - 1 }) },
              ]} />
            </div>
          </section>
          <p className="ui-hint">{say("web.newTable.previewHint")}</p>
          {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
          <div data-part="foot">
            <Split><Button kind="primary" type="button" icon="seat" aria-label={say("web.newTable.sit")} disabled={busy} onClick={() => void make()} data-testid="new-table-go" /></Split>
          </div>
        </>
      )}
    </Screen>
  );
}
