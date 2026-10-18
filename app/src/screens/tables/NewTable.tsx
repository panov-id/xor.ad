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
import { Icon } from "../../shell/Icon";
import { arrowRight, chevronLeft } from "../../shell/icons";
import { Screen } from "../../shell/Screen";
import { ErrorLine, refusedStatus } from "../me/parts";
import { Field } from "../register-parts";
import { radiusWord } from "../feed-logic";
import { die, seat } from "./icons";
import { countsLine, gameName, metaOf, TableRow, variantWord } from "./table-row";
import { back, canNext, nameRefused, next, pick, startWizard, TABLES_RADIUS, toneAt, type Wizard } from "./tables-logic";

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
  return (
    <Screen name="new-table" title={title} className="nt" data-step={String(w.step)}>
      <header className="mv-bar">
        <button type="button" className="mv-back" aria-label={label("common.back")} onClick={goBack} data-testid="new-table-back"><Icon d={chevronLeft} /></button>
        <h1 className="mv-title">{title}</h1>
      </header>
      <div className="nt-steps" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={w.step} aria-valuetext={words} aria-label={words} data-testid="new-table-step" data-step={String(w.step)}>
        <p className="reg-step" aria-hidden="true">{words}</p>
        <div className="reg-bars" aria-hidden="true">
          {[1, 2, 3].map((n) => <span key={n} data-done={n <= w.step ? "yes" : undefined} />)}
        </div>
      </div>
      <div className="nt-sheet">
        <div className="nt-body">
          {w.step === 1 && (
            <>
              <h2 className="nt-title">{say("app.nt.pick")}</h2>
              <ul className="nt-games" role="radiogroup" aria-label={say("app.nt.pick")} data-testid="new-table-games">
                {GAMES.map((g, i) => (
                  <li key={g.id}>
                    <button type="button" role="radio" aria-checked={w.draft.game === g.id} className={`nt-game tb-${toneAt(i)}`} onClick={() => setW(pick(w, g.id))}
                      aria-label={`${label(gameName(g))}, ${say("web.newTable.players", { n: seatsWord(g.seats) })}`} data-testid={`new-table-game-${g.id}`}>
                      <span className="nt-face" aria-hidden="true"><Icon d={die} /></span>
                      <span className="nt-game-name">{label(gameName(g))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {w.step === 2 && game && (
            <>
              <h2 className="nt-title">{label(gameName(game))}</h2>
              <p className="nt-lead">{say("app.nt.how_lead")}</p>
              <div className="reg-field">
                <label id="nt-variant">{label("web.newTable.variant")}</label>
                <div className="me-chips" role="radiogroup" aria-labelledby="nt-variant" data-testid="new-table-set">
                  {game.sets.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={w.draft.set === s} className="me-chip" lang={game.klass === "word" ? s : undefined}
                      onClick={() => setW({ ...w, draft: { ...w.draft, set: s } })} data-testid={`new-table-set-${s}`}>
                      {label(variantWord(game.id, s))}
                    </button>
                  ))}
                </div>
              </div>
              <div className="reg-field">
                <label id="nt-seats">{label("web.newTable.seats")}</label>
                <div className="me-chips" role="radiogroup" aria-labelledby="nt-seats" data-testid="new-table-seats">
                  {game.seats.map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={w.draft.seats === n} className="me-chip"
                      onClick={() => setW({ ...w, draft: { ...w.draft, seats: n } })} data-testid={`new-table-seats-${n}`}>
                      {sayCount("app.nt.seats", n)}
                    </button>
                  ))}
                </div>
              </div>
              <Field text={say("app.nt.name")} value={w.draft.name} maxLength={TABLE_NAME_MAX} autoComplete="off" testid="new-table-name"
                onChange={(v) => setW({ ...w, draft: { ...w.draft, name: graphemes(v, TABLE_NAME_MAX) } })}
                under={<p className="reg-counter" data-testid="new-table-left">{say("app.reg.left", { n: nameLeft(w.draft.name), max: TABLE_NAME_MAX })}</p>} />
              <ErrorLine text={error} />
            </>
          )}

          {w.step === 3 && game && w.draft.set && (
            <>
              <h2 className="nt-title">{say("app.nt.see")}</h2>
              <ul className="tb-list nt-see" data-testid="new-table-preview">
                <TableRow tone="lime" preview title={named || label(gameName(game))}
                  meta={metaOf(game, w.draft.set, !!named, countsLine(1, w.draft.seats ?? 2, 0))} />
              </ul>
              <p className="nt-hint">{say("app.nt.hint", { radius: say(radius.key, { n: radius.n }) })}</p>
              <ErrorLine text={error} />
            </>
          )}
        </div>
        <div className="nt-foot">
          <button type="button" className="cta cta-primary" aria-disabled={shut ? true : undefined} aria-busy={busy || undefined} onClick={go} data-testid={w.step === 3 ? "new-table-go" : "new-table-next"}>
            <Icon d={w.step === 3 ? seat : arrowRight} /><span>{w.step === 1 ? label("web.newTable.next") : w.step === 2 ? say("app.nt.preview") : label("web.newTable.sit")}</span>
          </button>
        </div>
      </div>
    </Screen>
  );
}
