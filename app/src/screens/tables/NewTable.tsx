// A new table (sosed Dusk w3_new-table-1..3; POST /tables): 1) a game by its tile — a tap picks it, «Next» goes on;
// 2) how you play — the variant, the seats and a name nobody has to give; 3) the table as neighbours will see it, and
// «Sit at the table» makes it. The web's NewTable (web screens/NewTable.tsx) through the same call (Tables.create), at the
// person's own spot and the circle the list looks in; the games, the body and the words are depth/core/new_table.ts.
// Back on every step: the step before, from step 1 out to where the person came from. Testids are the web's:
// new-table-back, new-table-step, new-table-games, new-table-game-<id>, new-table-set(-<set>), new-table-seats(-<n>),
// new-table-name, new-table-next, new-table-preview, new-table-go, error.
//
// Not compared with the sheet: Backgammon's «Short» (the node plays one backgammon) and «2 + watchers» (watchers need no
// seat: the node lets anyone watch) — a variant or seats the node cannot play are not offered (GOALS §6 question 9).
import { useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { GAMES, gameById, nameLeft, refusalCode, seatsWord, TABLE_NAME_MAX, tableBody } from "@sdk/new_table.ts";
import { Tables } from "@sdk/tables.ts";
import { graphemes } from "@sdk/limits.ts";
import { failedLine, label, say, sayCount } from "../../i18n";
import { storedPlace } from "../../place";
import { NdIcon } from "../../shell/NdIcon";
import { Screen } from "../../shell/Screen";
import { Rail } from "../../shell/TabBar";
import { ErrorLine, refusedStatus } from "../me/parts";
import { Field } from "../register-parts";
import { radiusWord } from "../feed-logic";
import { countsLine, gameIcon, gameName, gameTint, TableTile, variantWord } from "./table-row";
import { back, canNext, nameRefused, next, pick, startWizard, TABLES_RADIUS, type Wizard } from "./tables-logic";

// `picked`: a game chosen already (the wide tables' «Start a game»), the wizard opens on its first step with it chosen.
export function NewTable({ client, onMade, onBack, picked }: { client: Client; onMade: (id: string) => void; onBack: () => void; picked?: string }) {
  const place = useRef(storedPlace()).current;
  const [w, setW] = useState<Wizard>(() => (picked ? pick(startWizard(), picked) : startWizard()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const game = gameById(w.draft.game);
  const title = label("web.newTable.title");
  const words = label("web.register.step", { n: w.step, m: 3 });
  const goBack = () => {
    const before = back(w);
    if (before) { setError(null); setW(before); } else onBack();
  };

  async function make() {
    const body = tableBody(w.draft, place, TABLES_RADIUS);
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const made = await new Tables(client).create(body);
      if (made.status === 201) return onMade(made.body.id);
      if (refusalCode(made) === "name_refused") { setW(nameRefused(w)); setError(say("app.nt.refused_name")); } else setError(refusedStatus(made.status));
    } catch (e) {
      setError(failedLine(e));
    } finally {
      setBusy(false);
    }
  }

  const go = w.step === 3 ? () => void make() : () => { if (canNext(w)) setW(next(w)); };
  const shut = w.step === 3 ? busy : !canNext(w);
  const radius = radiusWord(TABLES_RADIUS);
  const named = w.draft.name.trim();
  // seats: the stepper (new-table-2) over the node's counts; the counts themselves stay as buttons for a reader and a script
  const at = game ? Math.max(0, game.seats.indexOf(w.draft.seats ?? game.seats[0])) : 0;
  const setSeats = (n: number) => setW({ ...w, draft: { ...w.draft, seats: n } });
  return (
    <Screen name="new-table" title={title} className="k-screen" data-step={String(w.step)}>
      <div className="k-col">
        <header className="k-row k-bar">
          <button type="button" className="k-bar-btn" aria-label={label("common.back")} onClick={goBack} data-testid="new-table-back"><NdIcon name="back" /></button>
          <div className="k-bar-title" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={w.step} aria-valuetext={words} aria-label={words} data-testid="new-table-step" data-step={String(w.step)}>
            <h1 className="k-bar-word">{title}</h1>
            <span className="k-steps" aria-hidden="true">{[1, 2, 3].map((n) => <span key={n} data-done={n <= w.step ? "yes" : undefined} />)}</span>
          </div>
        </header>
        {w.step === 1 && (
          <section className="k-body k-pad8">
            <ul className="k-grid2 k-tb-picks" role="radiogroup" aria-label={say("app.nt.pick")} data-testid="new-table-games">
              {GAMES.map((g) => (
                <li key={g.id}>
                  <button type="button" role="radio" aria-checked={w.draft.game === g.id} className="k-pick k-tb-pick" aria-pressed={w.draft.game === g.id} onClick={() => setW(pick(w, g.id))}
                    aria-label={`${label(gameName(g))}, ${say("web.newTable.players", { n: seatsWord(g.seats) })}`} data-testid={`new-table-game-${g.id}`}>
                    <span className="k-badge k-tb-badge" data-c={gameTint(g.id)}><NdIcon name={gameIcon(g.id)} /></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {w.step === 2 && game && (
          <section className="k-panel k-grow k-reg">
            <div className="k-row"><NdIcon name={gameIcon(game.id)} className="k-pin" /><h2 className="k-title">{label(gameName(game))}</h2></div>
            <div role="radiogroup" aria-labelledby="nt-variant" data-testid="new-table-set">
              <p id="nt-variant" hidden>{label("web.newTable.variant")}</p>
              <ul className="k-grid2 k-tb-sets">
                {game.sets.map((st) => (
                  <li key={st}>
                    <button type="button" role="radio" aria-checked={w.draft.set === st} aria-pressed={w.draft.set === st} className="k-pick k-tb-set" lang={game.klass === "word" ? st : undefined}
                      onClick={() => setW({ ...w, draft: { ...w.draft, set: st } })} data-testid={`new-table-set-${st}`}>
                      <span className="k-badge k-tb-badge-s" data-c={gameTint(game.id)}><NdIcon name={gameIcon(game.id)} /></span>
                      <span>{label(variantWord(game.id, st))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="k-row" data-testid="new-table-seats-row"><NdIcon name="party" className="k-pin k-tb-seats-ico" /><span className="k-meta" id="nt-seats">{label("web.newTable.seats")}</span></div>
            <div className="k-stepper" role="radiogroup" aria-labelledby="nt-seats" data-testid="new-table-seats">
              <button type="button" aria-label={say("app.nt.fewer")} disabled={at <= 0} onClick={() => setSeats(game.seats[at - 1])} data-testid="new-table-seats-less"><NdIcon name="back" /></button>
              <div className="k-pill k-tb-count" aria-live="polite"><span>{sayCount("app.nt.seats", w.draft.seats ?? game.seats[0])}</span></div>
              <button type="button" aria-label={say("app.nt.more")} disabled={at >= game.seats.length - 1} onClick={() => setSeats(game.seats[at + 1])} data-testid="new-table-seats-more"><NdIcon name="chev" /></button>
              {game.seats.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={w.draft.seats === n} className="k-tb-sr" tabIndex={-1} aria-label={sayCount("app.nt.seats", n)} onClick={() => setSeats(n)} data-testid={`new-table-seats-${n}`} />
              ))}
            </div>
            {/* new-table-2: the name is the bare pill with the pen; the label stays for the reader, the count sits at the right as on register-1. */}
            <div className="k-tb-name">
              <Field text={say("app.nt.name")} placeholder={say("app.nt.name")} value={w.draft.name} maxLength={TABLE_NAME_MAX} autoComplete="off" testid="new-table-name" icon="pen"
                onChange={(v) => setW({ ...w, draft: { ...w.draft, name: graphemes(v, TABLE_NAME_MAX) } })}
                side={<span className="k-meta" data-testid="new-table-left">{say("app.reg.left", { n: nameLeft(w.draft.name), max: TABLE_NAME_MAX })}</span>} />
            </div>
            <ErrorLine text={error} />
          </section>
        )}

        {w.step === 3 && game && w.draft.set && (
          <section className="k-panel k-grow k-reg">
            <div className="k-row"><NdIcon name="eye" className="k-pin" /><h2 className="k-sub">{say("app.nt.see")}</h2></div>
            <ul className="k-tb-see" data-testid="new-table-preview">
              <TableTile preview card={{ game: game.klass, set: w.draft.set, playing: 1, free_seats: (w.draft.seats ?? 2) - 1, watching: 0 }} title={named || label(gameName(game))} />
            </ul>
            <p className="k-note" role="status"><NdIcon name="nearby" /><span>{say("app.nt.hint", { radius: say(radius.key, { n: radius.n }) })}</span></p>
            <ErrorLine text={error} />
          </section>
        )}
        <section className="k-panel k-actions">
          <div className="k-row">
            {w.step > 1 && <button type="button" className="k-tk-round" aria-label={label("common.back")} onClick={goBack}><NdIcon name="back" /></button>}
            <button type="button" className="k-cta" aria-disabled={shut ? true : undefined} aria-busy={busy || undefined} onClick={go} data-testid={w.step === 3 ? "new-table-go" : "new-table-next"}>
              <NdIcon name={w.step === 3 ? "check" : "chev"} /><span>{w.step === 1 ? label("web.newTable.next") : w.step === 2 ? say("app.nt.preview") : label("web.newTable.sit")}</span>
            </button>
          </div>
        </section>
        <Rail active="tables" />
      </div>
    </Screen>
  );
}
