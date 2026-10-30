// A table (sheets w3_table-*, sosed Dusk, mobile): the bar — back, «game · name», «…» — the two faces with the line
// under mine and the ring of the move's minutes, the board on its panel, and the stickers as chips at the foot. The
// web's Table.tsx moves: the view once (Tables.view), then the room's frames laid on it (depth/web-platform
// table_room.ts, depth/core applyFrame); moves, passes, proposals and lines through depth/core Tables. The node keeps
// every rule (relay/node/src/lib/tables_*.ts); what the frame shows is table-logic.ts, each board draws its own part.
// Back leaves the table with the seat kept (web TB1, owner 11.10.2026: «"Назад" без вставания»); «Leave» in «…» stands up.
// Testids (the web's): table, table-more, table-menu, pass, resign, like, table-stand, start-game, accept-game,
// decline-game, turn, over, stickers, sticker-<id>; plus table-back, face-left, face-right, move-ring.
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Client } from "@sdk/client.ts";
import { gameOfTable } from "@sdk/new_table.ts";
import { applyFrame, frameNeedsView, openApplications, type TableView, Tables } from "@sdk/tables.ts";
import { connectTable } from "@platform/table_room.ts";
import { capital } from "../../i18n-core";
import { failedLine, label, LANG, say } from "../../i18n";
import { useLayers } from "../../shell/layers";
import { NdIcon } from "../../shell/NdIcon";
import { Screen } from "../../shell/Screen";
import { Rail } from "../../shell/TabBar";
import { Board, BoardUnder } from "./boards";
import { FootSlot } from "./foot-slot";
import { Solo } from "./solo";
import { soloOf, soloShown } from "./solo-logic";
import { gameIcon, gameName } from "./table-row";
import { useMinWidth } from "../../shell/useMinWidth";
import { canApply, canNudge, conStep, facePair, firstAction, footInput, footOf, menuTiles, sureStill, overBanner, meLine, moveRing, STICKER_CHIPS, tableTitle, talkLines } from "./table-logic";

type Answer = { status: number; body: unknown };
// the icon each sticker of the node's set is drawn with (table.html: the strip of icon chips)
const CHIP_ICON: Record<string, string> = { hi: "wave", thanks: "thanks", deal: "deal", wow: "wow", coffee: "coffee", move: "move", again: "rematch", giveup: "giveup" };
// A chip says the app's own word where the sheet has one (app.table.sticker.hi «Hi!»), else the catalogue's, capitalised.
const chipWord = (id: string): string => {
  const own = `app.table.sticker.${id}`;
  const word = say(own);
  return word === own ? capital(say(`web.sticker.${id}`), LANG) : word;
};
const refusalOf = (a: Answer): string | null => (a.status < 400 ? null : say("app.failed"));

export function Table({ client, tableId, onBack, onLeave, onTable }: { client: Client; tableId: string; onBack: () => void; onLeave: () => void; onTable?: (id: string) => void }) {
  const [tables] = useState(() => new Tables(client));
  const [view, setView] = useState<TableView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the other seats' chips only where the pane has room (at 390 four chips crush my line of the move)
  const desk = useMinWidth("--bp-desktop");
  // Seated at another table (Back keeps the seat; the node: 409 already_seated with that table): the reason and the way there.
  const [elsewhere, setElsewhere] = useState<string | null>(null);
  const [, tick] = useState(0);
  const [said, setSaid] = useState("");
  // The puzzle while waiting (§6.2) is open on this device; the node only hears the mark (Tables.solo).
  const [soloOpen, setSoloOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  // the foot's slot where a board portals its turn buttons (foot-slot.tsx)
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // «Your turn» (B5): what my nudge got (sent / wait a minute), and a nudge to me heard in this table's room
  const [nudge, setNudge] = useState<"sent" | "wait" | null>(null);
  const [nudged, setNudged] = useState(false);   // one application at a time: a double press sent two, the second 409
  // «Pass» and «Give up» from «…» ask first on a screen of their own (table-pass-confirm, table-giveup-confirm)
  const [sure, setSure] = useState<"pass" | "resign" | null>(null);
  const { open, close } = useLayers();

  const load = useCallback(async () => {
    try {
      const answer = await tables.view(tableId);
      if (answer.status === 200) setView(answer.body); else setError(refusalOf(answer));
    } catch (e) { setError(failedLine(e)); }
  }, [tables, tableId]);

  // The room: the view once, each frame laid on it; a frame that changes who plays reads the table whole again.
  // A seat first (the web's enterTable, web/src/App.tsx:363): the node answers a table only to a live seat (SEC-4), so
  // a table opened from the feed or the list sits the person down — the node keeps a seat already held at this table
  // (200) and refuses a full or closed one, or a seat at another table (the sheet's failed line).
  useEffect(() => {
    let live = true, room: { stop: () => void } | null = null;
    void tables.sit(tableId).then((sat) => {
      if (!live) return;
      const other = (sat.body as { error?: { code?: string; table?: string } } | undefined)?.error;
      if (sat.status === 409 && other?.code === "already_seated" && other.table) return setElsewhere(other.table);
      if (sat.status < 200 || sat.status >= 300) return setError(refusalOf(sat));
      void load();
      room = connectTable(client, tableId, (event) => {
        if (event.kind === "connected") return void load();
        if (event.kind === "gone") return onLeave();
        if (event.kind !== "frame") return;
        if (event.frame.type === "nudge") { setNudged(true); return; }
        setView((v) => (v ? applyFrame(v, event.frame) : v));
        if (frameNeedsView(event.frame)) void load();
      });
    }).catch((e) => { if (live) setError(failedLine(e)); });
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => { live = false; room?.stop(); clearInterval(clock); };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // The puzzle follows the node's mark: back at the table with it on (a reload, a guest gone) it opens where it was; a round
  // started clears the mark on the node (startRound), and the puzzle closes with it instead of coming back after the round.
  useEffect(() => { setSoloOpen(!!view?.solo); }, [view?.solo]);
  // a move made answers the nudge both ways: the next turn starts with none
  useEffect(() => { setNudge(null); setNudged(false); }, [view?.board?.turn, view?.board?.seq]);
  // the round moved on while asking (the turn passed, it ended, the board went): the question is gone, back to the table
  useEffect(() => { if (sure && (!view || !sureStill(sure, view))) setSure(null); }, [sure, view]);

  const act = async (run: () => Promise<Answer>) => {
    setError(null);
    try { const refused = refusalOf(await run()); if (refused) setError(refused); } catch (e) { setError(failedLine(e)); }
    await load();
  };

  const game = view ? gameOfTable(view.class, view.set) : undefined;
  const title = view ? tableTitle(game ? label(gameName(game)) : label("table.title"), view.name) : label("table.title");
  const bar = (more?: ReactNode) => (
    <header className="k-row k-bar">
      <button type="button" className="k-bar-btn" aria-label={label("common.back")} onClick={onBack} data-testid="table-back"><NdIcon name="back" /></button>
      <h1 className="k-bar-title">{game && <NdIcon name={gameIcon(game.id)} className="k-tb-bar-ico" />}<span>{title}</span></h1>
      {more}
    </header>
  );
  if (!view) {
    return (
      <Screen name="table" title={title} className="k-screen">
        <div className="k-col">
          {bar()}
          <section className="k-panel k-grow">{elsewhere ? (
            <div className="k-tb-empty" data-testid="seated-elsewhere">
              <p>{say("app.table.elsewhere")}</p>
              {onTable && <button type="button" className="k-cta" onClick={() => onTable(elsewhere)} data-testid="to-my-table">{say("app.table.to_mine")}</button>}
            </div>
          ) : error ? <p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p> : <p className="k-sub" aria-busy="true">…</p>}</section>
          <Rail active="tables" />
        </div>
      </Screen>
    );
  }

  const board = view.board;
  const { left, right, rest } = facePair(view);
  const mine = meLine(view);
  const ring = moveRing(view);
  const first = firstAction(view);
  const started = !!board && !board.over && board.turn !== null;
  const con = conStep(board?.state, view.seat, view.is_playing && started && board!.turn === view.seat);
  const pending = board?.pending as { id: string; by?: number; answers?: Record<string, string> } | null | undefined;
  const answered = !!pending && (pending.by === view.seat || pending.answers?.[String(view.seat)] === "accept");
  const proposed = view.is_playing && !!pending && !answered;
  // Playing alone (§6.2): on one's own table with nobody else playing; a neighbour's application folds it into a strip.
  const soloKind = soloOf(game?.id);
  const soloHere = !!soloKind && soloShown(view);
  const asks = openApplications(view).length > 0;
  const ask = openApplications(view)[0];
  const guest = ask ? { seat: ask.seat, name: view.seats.find((x) => x.seat === ask.seat)?.name ?? "?" } : null;
  // opened at once; a refused mark (409 game_running, not_playing) takes it back, so the device never plays unmarked
  const setSolo = (on: boolean) => { setSoloOpen(on); void act(async () => { const a = await tables.solo(tableId, on); if (refusalOf(a)) setSoloOpen(!on); return a; }); };
  const onMove = view.is_playing && started && board!.turn === view.seat ? (m: unknown) => void act(() => tables.move(tableId, board!.seq, m)) : undefined;
  const poke = async () => {
    try {
      const sent = await tables.nudge(tableId);
      setNudge(sent.status === 204 ? "sent" : sent.status === 429 ? "wait" : null);
      if (sent.status !== 204 && sent.status !== 429) setError(refusalOf(sent));
    } catch (e) { setError(failedLine(e)); }
  };
  const line = mine.state === "your-move" ? say("app.table.your_move")
    : mine.state === "their-move" ? say("app.table.their_move", { name: mine.name ?? "" })
    : mine.state === "over" ? say("table.over") : mine.state === "not-started" ? say("table.notStarted") : say("app.table.watching");

  const banner = overBanner(view);
  const foot = footOf({ proposed, first, con: !!con.offer, apply: canApply(view) === "apply" });
  const stand = () => void act(async () => { const a = await tables.stand(tableId); if (a.status < 400) onLeave(); return a; });
  // table-more.html: the title, then tiles — «Pass» and «Give up» wide, «Your turn», «Like» and «Leave» under them
  // (coordinator 27.10: the sheet's clock is the nudge, imin-off the like, the door standing up)
  const tile = (testid: string, icon: string, c: string, word: string, run: () => void, danger?: boolean) => (
    <li key={testid}><button type="button" className="k-hub-tile k-tb-tile" data-danger={danger ? "" : undefined} onClick={() => { close(); run(); }} data-testid={testid}>
      <span className="k-badge" data-c={c} aria-hidden="true"><NdIcon name={icon} /></span><span className="k-row-name">{capital(word, LANG)}</span>
    </button></li>
  );
  const menu = () => open("table-more", (
    <div className="k-stack" data-testid="table-menu">
      <h2 className="k-sheet-title">{title}</h2>
      <ul className="k-tb-menu">
        {menuTiles({ canPass: first !== "start" && !!onMove, canResign: view.is_playing && started, canNudge: canNudge(view) && !nudge }).map((t) =>
          t === "pass" ? tile("pass", "skip", "4", say("table.pass"), () => setSure("pass"))
          : t === "resign" ? tile("resign", "giveup", "6", say("table.resign"), () => setSure("resign"))
          : t === "nudge" ? tile("menu-nudge", "clock", "5", say("app.table.nudge"), () => void poke())
          : t === "like" ? tile("like", "imin-off", "3", say("table.like"), () => void act(() => tables.like(tableId)))
          : tile("table-stand", "door", "2", say("table.stand"), stand, true))}
      </ul>
    </div>
  ));

  if (sure && sureStill(sure, view)) {
    // the view of this render: the seq the pass names is the board's now, not the one when «…» opened
    const go = sure === "pass" ? () => tables.pass(tableId, board!.seq) : () => tables.resign(tableId);
    return <SureMove what={sure} onCancel={() => setSure(null)} onSure={() => { setSure(null); void act(go); }} />;
  }

  // the sticker strip (table.html), one element for every foot that shows it
  const stickers = (
    <div className="k-ch-quick" role="group" aria-label={say("web.sticker.title")} data-testid="stickers">
      {STICKER_CHIPS.map((id) => (
        <button key={id} type="button" className="k-ch-chip" aria-label={chipWord(id)} onClick={() => void act(() => tables.say(tableId, { kind: "sticker", sticker: id }))} data-testid={`sticker-${id}`}>
          <NdIcon name={CHIP_ICON[id] ?? "good"} />
        </button>
      ))}
    </div>
  );

  return (
    <Screen name="table" title={title} className="k-screen" data-testid="table" data-id={tableId}>
      <FootSlot.Provider value={slot}>
      <div className="k-col">
        {bar(<button type="button" className="k-bar-btn" aria-label={say("web.chat.more")} aria-haspopup="dialog" onClick={menu} data-testid="table-more"><NdIcon name="more" /></button>)}
        {soloHere && guest && (
          // table-solo-guest: the neighbour who asks, in place of the players — «×» refuses, the wide pill starts a round with them
          <section className="k-panel k-pad8 k-tb-guest" data-testid="solo-guest">
            <div className="k-row">
              <span className="k-gp-ava" aria-hidden="true"><NdIcon name="me" /></span>
              <span className="k-stack"><b>{guest.name}</b><span>{say("app.solo.guest")}</span></span>
            </div>
            <div className="k-row">
              <button type="button" className="k-tb-key" aria-label={say("web.table.decline")} onClick={() => void act(() => tables.refuse(tableId, guest.seat, say("web.table.decline")))} data-testid="guest-refuse"><NdIcon name="close" /></button>
              <button type="button" className="k-cta" onClick={() => void act(() => tables.propose(tableId, "rematch"))} data-testid="guest-start"><NdIcon name="rematch" /><span>{say("web.table.start")}</span></button>
            </div>
          </section>
        )}
        {/* table-solo: while the puzzle is open the players step aside; the right pane is the hint over the puzzle's foot */}
        {!(soloHere && (guest || soloOpen)) && <section className="k-panel k-pad8 k-gp-players">
          <div className="k-row">
            {/* table.html: my face carries the line of the move under the name and the ring of its minutes; no strip of its own */}
            {left && <div className="k-gp-chip" data-mine="" data-testid="face-left"><span className="k-gp-ava" aria-hidden="true"><NdIcon name="me" /></span>
              <span className="k-stack k-grow"><b>{left.name || "?"}</b>
                <span className="k-tb-me" data-testid={board?.over ? "over" : "turn"}>{line}
                  {nudged && board?.turn === view.seat && !board?.over && <span className="tg-nudged" role="status" data-testid="nudged"> · {say("app.table.nudged")}</span>}
                </span>
              </span>
              {ring && (
                <span className="k-ring k-tb-ring" style={{ "--k-ring": ring.share } as CSSProperties} role="img" aria-label={say("app.table.minutes", { n: ring.minutes })} data-testid="move-ring">
                  <span aria-hidden="true">{ring.minutes}</span>
                </span>
              )}
            </div>}
            {right && <div className="k-gp-chip" data-testid="face-right" aria-label={right.name}><span className="k-gp-ava" aria-hidden="true"><NdIcon name="me" /></span>
              <span className="k-stack"><b>{right.name}</b>
                {canNudge(view) && (nudge
                  ? <span className="tg-nudge-said" role="status" data-testid="nudge-said">{say(nudge === "sent" ? "app.table.nudge_sent" : "app.table.nudge_wait")}</span>
                  : <button type="button" className="tg-nudge" onClick={() => void poke()} data-testid="nudge">{say("app.table.nudge")}</button>)}
              </span>
            </div>}
            {/* durak-turn, poker-bet: a chip per other playing seat after the pair */}
            {desk && rest.map((s) => <div className="k-gp-chip" key={s.seat} data-testid={`face-${s.seat}`} aria-label={s.name}><span className="k-gp-ava" aria-hidden="true"><NdIcon name="me" /></span><span className="k-stack"><b>{s.name}</b></span></div>)}
          </div>
        </section>}
        {/* desktop-1920 *-turn sheets: the round's status under the players — clock, the line of the move, its ring (the phone's sheet has none: kit hides it) */}
        {!(soloHere && (soloOpen || guest)) && <section className="k-panel k-pad8 k-tb-status" data-testid="round-status">
          <div className="k-row"><NdIcon name="clock" /><span className="k-grow">{line}</span>
            {ring && <span className="k-ring k-tb-ring" style={{ "--k-ring": ring.share } as CSSProperties} aria-hidden="true" data-testid="status-ring"><span>{ring.minutes}</span></span>}
          </div>
        </section>}
        <section className="k-panel k-pad8 k-grow k-gp-board k-tb-board">
          {banner && (
            <div className="k-tb-won" role="status" data-testid="over-banner">
              <NdIcon name="wow" />
              <span className="k-stack"><b>{say("table.over")}</b><span>{banner.names}</span></span>
              <span className="k-tb-won-score" aria-label={banner.chips.map((c) => c.n).join(" : ")}>{banner.chips.map((c) => <span key={c.seat}>{c.n}</span>)}</span>
            </div>
          )}
          {soloHere && soloOpen && !asks && <Solo tableId={tableId} kind={soloKind!} onClose={() => setSolo(false)} />}
          {/* table-solo-guest: the puzzle stays under the guest's card, pale and out of reach until the guest is answered */}
          {soloHere && soloOpen && asks && <div className="k-tb-dim" inert data-testid="solo-dim"><FootSlot.Provider value={null}><Solo tableId={tableId} kind={soloKind!} onClose={() => setSolo(false)} /></FootSlot.Provider></div>}
          {soloHere && !soloOpen && (
            // table-wait: the hourglass card in the board's place; the puzzle is a small link under the words
            <div className="k-tb-empty" data-testid="solo-wait">
              <span className="k-tb-hero"><NdIcon name="hourglass" /></span>
              <h2>{say("table.notStarted")}</h2>
              <button type="button" className="k-btn solo-open" onClick={() => setSolo(true)} data-testid="solo-open">{say(view.solo ? "app.solo.back" : "app.solo.open")}</button>
            </div>
          )}
          {/* table-wait / table-solo: an empty own table draws no board, the card or the puzzle stands in its place */}
          {!soloHere && <div className="tg-panel" data-class={view.class} data-set={view.set}>
            <Board klass={view.class} set={view.set} state={board?.state} seat={view.seat} seats={view.seats.filter((s) => s.role === "playing").map((s) => s.seat).sort((a, b) => a - b)} onMove={onMove} />
          </div>}
          {con.waiting && <p className="k-sub tg-con-wait" data-testid="con-waiting">{say("app.table.con_waiting")}</p>}
          {canApply(view) === "applied" && <p className="k-sub tg-con-wait" data-testid="applied">{say("app.table.applied")}</p>}
          {error && <p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p>}
        </section>
        {/* desktop-1440 table.svg: the talk at the table in the right column, as a talk's bubbles (the phone's sheet has none: kit hides it) */}
        {/* table-solo-guest: under the guest card the same hint, with the hourglass; no foot */}
        {soloHere && (soloOpen || guest) ? (
          <section className="k-panel k-tb-talk k-tb-empty" data-testid="solo-pane">
            <span className="k-tb-hero"><NdIcon name={guest ? "hourglass" : "tables"} /></span>
            <h2>{say("app.solo.waiting")}</h2>
          </section>
        ) : <section className="k-panel k-pad8 k-tb-talk" aria-label={label("table.say")}>
          <ol className="k-ch-list" data-testid="table-lines" aria-live="polite">
            {talkLines(view).map((l) => (
              <li key={l.id} className={`k-ch-row ${l.mine ? "k-ch-mine" : "k-ch-theirs"}`} aria-label={l.name}>
                <p className={l.sticker ? "k-ch-bubble k-ch-sticker" : "k-ch-bubble"}>{l.sticker ? chipWord(l.sticker) : l.text}</p>
              </li>
            ))}
          </ol>
        </section>}
        {/* what a game keeps under its board (the fleet strip, the poker bet, the durak row) is its own panel between the board and
            the foot, as battleship-place draws it — not inside the board's panel */}
        <BoardUnder klass={view.class} set={view.set} state={board?.state} seat={view.seat} onMove={onMove} />
        {/* The foot by the table's state (owner 27.10.2026, «Прототип + ввод»): *-wait «Stand · Start», *-over «Stand · Another
            round», a proposal «Decline · Accept», the con «… · the round is mine / agree», else the sticker strip (table.html);
            the players' input row (owner 14.10.2026: «вернуть текст игрокам») stays above it whenever the person plays. */}
        {!(soloHere && guest) && <section className="k-panel k-pad8 k-tb-foot" data-foot={soloHere && soloOpen && !guest ? "solo" : foot}>
          {/* the game's own turn buttons (roll, take, bets, ends) land here; the stickers step aside while it has any */}
          <div className="k-tb-acts" ref={setSlot} data-testid="foot-game" />
          {soloHere && soloOpen && !guest ? null : foot === "ask" ? (
            <div className="k-row">
              <button type="button" className="k-cta" data-outline="" onClick={() => void act(() => tables.answer(tableId, pending!.id, "decline"))} data-testid="decline-game">{say("web.table.decline")}</button>
              <button type="button" className="k-cta" onClick={() => void act(() => tables.answer(tableId, pending!.id, "accept"))} data-testid="accept-game"><NdIcon name="check" /><span>{say("web.table.accept")}</span></button>
            </div>
          ) : foot === "start" ? (
            <div className="k-row">
              <button type="button" className="k-tk-round" aria-label={say("table.stand")} onClick={stand} data-testid="foot-stand"><NdIcon name="door" /></button>
              <button type="button" className="k-cta" onClick={() => void act(() => tables.propose(tableId, "rematch"))} data-testid="start-game">
                <NdIcon name="rematch" /><span>{say(!board || board.over ? "web.game.rematch" : "web.table.start")}</span>
              </button>
            </div>
          ) : foot === "con" ? (
            // The con by agreement (checkers, chess, backgammon: the rules are the people's): «the round is mine», or agree to theirs;
            // at desk the strip stands under it (8-games *-turn), on phones kit.css hides it.
            <><div className="k-row">
              <button type="button" className="k-tk-round" aria-label={say("web.chat.more")} aria-haspopup="dialog" onClick={menu} data-testid="foot-more"><NdIcon name="more" /></button>
              <button type="button" className="k-cta" data-outline={con.offer === "claim" ? "" : undefined} onClick={() => void act(() => tables.move(tableId, board!.seq, { con: con.offer === "claim" ? "won" : "agree" }))} data-testid={`con-${con.offer}`}>
                <NdIcon name={con.offer === "claim" ? "wow" : "check"} /><span>{say(con.offer === "claim" ? "web.table.con_won" : "web.table.con_agree")}</span>
              </button>
            </div>
            {stickers}</>
          ) : foot === "apply" ? (
            // A watcher asks into the next round (§6.1); the host sees it over the puzzle (§6.2) and starts the game.
            <div className="k-row">
              <button type="button" className="k-cta" disabled={applying} onClick={() => { setApplying(true); void act(() => tables.say(tableId, { kind: "application", text: say("app.table.apply") })).finally(() => setApplying(false)); }} data-testid="apply">
                <NdIcon name="plus" /><span>{say("app.table.apply")}</span>
              </button>
            </div>
          ) : (
            stickers
          )}
          {/* table.html: the input row under the strip; the round over (table-over, *-over) has the two buttons only */}
          {!(soloHere && soloOpen && !guest) && footInput(view) && (
            <form className="k-row" onSubmit={(e) => { e.preventDefault(); const text = said.trim(); if (text) void act(() => tables.say(tableId, { kind: "line", text })).then(() => setSaid("")); }}>
              <input className="k-tk-input" value={said} maxLength={128} onChange={(e) => setSaid(e.target.value)} placeholder={say("app.table.message")} aria-label={say("web.table.line")} data-testid="line-input" />
              <button type="submit" className="k-tk-send" aria-label={say("app.chat.send")} disabled={!said.trim()} data-testid="line-send"><NdIcon name="send" /></button>
            </form>
          )}
        </section>}
        <Rail active="tables" />
      </div>
      </FootSlot.Provider>
    </Screen>
  );
}

/** Pass or give up, asked on a screen of their own (table-pass-confirm.html, table-giveup-confirm.html): the bar with back,
 *  the move's mark in its circle, what it costs, both answers outlined at the foot. */
function SureMove({ what, onCancel, onSure }: { what: "pass" | "resign"; onCancel: () => void; onSure: () => void }) {
  const pass = what === "pass";
  return (
    <main className="k-screen" data-screen={pass ? "table-pass-confirm" : "table-giveup-confirm"}>
      <div className="k-col">
        <header className="k-row k-bar">
          <button type="button" className="k-bar-btn" aria-label={label("common.back")} onClick={onCancel} data-testid="sure-back"><NdIcon name="back" /></button>
          <h1 className="k-bar-title">{capital(say(pass ? "table.pass" : "table.resign"), LANG)}</h1>
        </header>
        <section className="k-panel k-grow k-reg k-centre-col">
          <span className="k-mark-110" style={{ background: pass ? "var(--acc-4)" : "var(--acc-6)" }} aria-hidden="true"><NdIcon name={pass ? "skip" : "giveup"} /></span>
          <h2 className="k-sheet-title">{say(pass ? "app.table.pass_sure" : "app.table.giveup_sure")}</h2>
          <p className="k-sub k-price">{say(pass ? "app.table.pass_price" : "app.table.giveup_price")}</p>
        </section>
        <section className="k-panel k-actions">
          <div className="k-two">
            <button type="button" className="k-cta" data-outline="" aria-label={say("app.table.sure_cancel")} onClick={onCancel} data-testid="sure-cancel"><NdIcon name="close" /></button>
            <button type="button" className="k-cta" data-outline="" data-strong="" aria-label={say("app.table.sure_ok")} onClick={onSure} data-testid="sure-ok"><NdIcon name="check" /></button>
          </div>
        </section>
      </div>
      <Rail active="tables" />
    </main>
  );
}
