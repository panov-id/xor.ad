// The terminal face: which screen is on, and nothing else. Every fact it
// holds — the identity, the point, the phrase, the conversation — lives in
// this process and dies with it (§8.13, and the owner's decision about the
// point, 2026-09-22).

import { createElement as h, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import { Client } from "../core/client.ts";
import type { Statement } from "../core/client.ts";
import { newPaperCode, paperGroups } from "../core/paper.ts";
import { HeldKey } from "../core/transfer.ts";
import { languageOf } from "./strings.ts";
import type { Say } from "./strings.ts";
import { Complaint } from "./screens/complaint.ts";
import { Feed, Location, PaperCode, PaperCodeEntry, PinSet, Registration } from "./screens.ts";
import { isCurrentCode, raise, refusal, reissue } from "../core/recovery.ts";
import type { Outcome } from "../core/recovery.ts";
import type { Place } from "./screens.ts";
import {
  Away, Blocked, ChangePin, Chat, EditProfile, Hidden, Inbox, Liked, Me, StartAgain, StepAway, Statements, Write,
} from "./rooms.ts";
import { MovedAway, MoveIn, MoveOut } from "./move.ts";
import { plain, useKeys } from "./parts.ts";
import { RaisedHere, RaisedHerePin } from "./screens/restore.ts";
import { IDLE_MS, IdleTimer } from "../core/lock.ts";
import { Lock } from "./screens/lock.ts";
import { Closed } from "./screens/closed.ts";
import { NewTable, SeatedElsewhere, TableRoom } from "./table.ts";
import { openTable, Tables } from "../core/tables.ts";
import { Waiting } from "./screens/pending.ts";
import type { SessionClose } from "./screens/closed.ts";

// The phrase's length is the node's to state (§8.3). Until GET /limits
// answers, the screen uses this number — and it is the registry's 128
// (limits.tsv phrase.length), not the 146 the terminal used to carry against
// a node that refused at 128 (review panel, 2026-09-22).
const LENGTH_UNTIL_THE_NODE_SPEAKS = 128;

type Where =
  | { screen: "register" }
  | { screen: "pin"; name: string; age: number }
  // The code's groups live here and nowhere else, and go with this screen.
  | { screen: "paper"; groups: string[] }
  | { screen: "changePin" }
  | { screen: "reset" }
  | { screen: "location" }
  | { screen: "feed" }
  // V8 · a complaint about an offer card from the feed (O1d; screens/complaint.ts).
  | { screen: "complaint"; offerId: string }
  | { screen: "newTable" }
  | { screen: "table"; id: string }
  | { screen: "seatedElsewhere"; there: string; here: string }
  | { screen: "write" }
  | { screen: "inbox" }
  | { screen: "hidden" }
  | { screen: "statements"; from?: "me" }
  | { screen: "liked" }
  | { screen: "blocked" }
  | { screen: "me" }
  | { screen: "stepAway" }
  | { screen: "edit"; field: "name" | "age"; current: string }
  | { screen: "away"; until: number }
  | { screen: "chat"; chatId: string; matchId?: string; name: string; age: number; span?: number; endsAt?: number }
  // P9 · one's own consent given, the second's not yet (§8.5): the conversation
  // that waits, with the queue of lines on this device (screens/pending.ts).
  | { screen: "waiting"; matchId: string; name: string; age: number }
  // The move (§8.2, depth/ink/move.ts): out of this device, the frozen end,
  // into this one, and the first PIN of the device the identity arrived at.
  | { screen: "move" }
  | { screen: "movedAway" }
  | { screen: "moveIn" }
  | { screen: "arrivedPin" }
  // B1 · the paper code used (§8.2). The codes live in these states and go
  // with them: the one on paper until the new one is confirmed, then neither.
  | { screen: "restore" }
  | { screen: "restorePin"; old: string }
  // P6 · the code used on this very device: keep the PIN, or a new one under
  // the grant the claim left (§8.2; depth.pin.forgot.samedevice).
  | { screen: "raisedHere"; old: string; next: string; groups: string[] }
  | { screen: "raisedHerePin"; old: string; next: string; groups: string[] }
  | { screen: "reissue" }
  | { screen: "newPaper"; old: string; next: string; groups: string[] };

// B1 · how a use of the paper code ended, as one line.
function outcomeLine(say: Say, o: Outcome): string {
  if (o.ok) return "";
  if (o.reason === "no_match") return say("restore.noMatch");
  if (o.reason === "rate_limited") return say("restore.wait", { n: String(o.retryAfter ?? "?") });
  if (o.reason === "stepped_away") return say("restore.away");
  return say("restore.refused", { status: String(o.status ?? "?") });
}

// `fresh` makes the client a new identity starts on: "start again" closes this
// one for good (§8.2), and the next is someone else, keys and all. Without it
// the process ends there.
// `start: "restore"` is `depth restore`: a clean device raising an identity
// with its paper code instead of registering a new one.
export function App({ say, client: first, fresh, start, idleMs = IDLE_MS }: {
  say: Say; client: Client; fresh?: () => Client; start?: "restore" | "moveIn";
  // Five minutes by default (core/lock.ts); a test hands in less.
  idleMs?: number;
}): ReactElement {
  const [client, setClient] = useState(first);
  // ── The lock (depth-client §, 2026-09-17) ──
  // Every key touches the timer; when it fires with an identity on the screen
  // the core is locked and the face is one line (screens/lock.ts). Drawing
  // Lock instead of the body unmounts the rooms, and unmounting closes their
  // sockets — a locked client holds no socket, as the spec asks.
  const [locked, setLocked] = useState(false);
  const timer = useRef<IdleTimer | null>(null);
  useEffect(() => {
    const t = new IdleTimer(() => {
      // Not `registered`: a raised or moved-in identity has a session before
      // it has a PIN, and a lock with nothing to open it is a dead screen.
      if (!client.canLock || client.locked) return;
      void client.lock().then(() => setLocked(true));
    }, idleMs);
    timer.current = t;
    return () => t.stop();
  }, [client, idleMs]);
  useKeys(() => timer.current?.touch());
  // 4002 and 4004 end the session, not a room (protocol §4.4): whichever
  // screen was on gives way to the one that says so (screens/closed.ts).
  const [closedWith, setClosedWith] = useState<SessionClose | null>(null);
  // `depth move` opens on the code typed in (§8.2), as `depth restore` opens
  // on the paper code.
  const [where, setWhere] = useState<Where>(start ? { screen: start } : { screen: "register" });
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(LENGTH_UNTIL_THE_NODE_SPEAKS);
  const [place, setPlace] = useState<Place | undefined>(undefined);
  const [mine, setMine] = useState<{ id?: string; text: string; state: string } | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  // Every error a screen reports lands here, and an error's words can carry
  // what the node or the other device sent — a JSON parser quotes its input
  // with the escapes in it. So they are drawn as anything else from outside
  // is: through plain (review panel 2026-09-26, F3).
  const fail = (message: string) => setError(say("common.error", { message: plain(message, 300) }));
  // An error belongs to the screen it was said on: the next screen starts
  // clean. "Что-то пошло не так: no ephemeral pair…" from a conversation's
  // first opening stayed under the inbox and the feed until something else
  // went wrong (W12-RO, found on W11-MV).
  // B19 · a use of the paper code refused because the identity stepped away:
  // the screen that said so offers the way back itself (depth.away.return).
  const [away, setAway] = useState(false);
  // …except "Вы отошли": it is not an error of one screen but a state of the
  // identity, and the code's screen is reached with it still said (live test
  // "away again before the trade is confirmed", red on a509d529).
  useEffect(() => { if (!away) setError(undefined); }, [where.screen]);
  const refused = (o: Outcome) => {
    setError(outcomeLine(say, o));
    setAway(!o.ok && o.reason === "stepped_away");
  };
  const comeBack = away
    ? () => {
      setBusy(true);
      client.comeBack()
        .then(() => {
          setAway(false);
          setError(undefined);
        })
        .catch((e: Error) => fail(e.message))
        .finally(() => setBusy(false));
    }
    : undefined;
  // Read once a run, when the feed is first reached: with no e-mail on file,
  // the app is where an Article 17 statement is delivered (dsa/SPEC §7), and
  // the first time they arrive they are shown whole, not as a count.
  const [statements, setStatements] = useState<Statement[] | null>(null);
  // P9 · the offers this process agreed to and still waits on: the node's inbox
  // row does not say so (it marks the other side's consent), and the queue
  // before the second's consent lives on this device anyway (§8.5).
  const [consented, setConsented] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (where.screen !== "feed" || statements !== null) return;
    client.statements()
      .then((items) => {
        setStatements(items);
        if (items.length > 0) setWhere({ screen: "statements" });
      })
      .catch((e: Error) => fail(e.message));
  }, [where.screen]);

  // No point yet — an identity raised by its code and turned back before the
  // new code took — goes to the location, not to a feed with nothing to show
  // (the feed read place.lat of undefined and killed the process; verifier,
  // 2026-09-26).
  const feed = () => setWhere(place ? { screen: "feed" } : { screen: "location" });
  const me = () => setWhere({ screen: "me" });
  const body = (() => {
    switch (where.screen) {
      case "register":
        return h(Registration, {
          say,
          error,
          onDone: (name, age) => {
            setError(undefined);
            setWhere({ screen: "pin", name, age });
          },
          onMoveIn: () => {
            setError(undefined);
            setWhere({ screen: "moveIn" });
          },
        });
      case "pin":
        return h(PinSet, {
          say,
          busy,
          error,
          // The identity is made here: the node needs the code's lookup and
          // the PIN's proof in the same request (§13 step 1). The code is made
          // on the device and handed to the next screen only.
          onDone: (pin) => {
            setError(undefined);
            setBusy(true);
            const paperCode = newPaperCode();
            // The long key is held here, while it is still extractable: without
            // it this identity could never move (quorum 3/3, 26.09.2026).
            client.register({ name: where.name, age: where.age }, { pin, paperCode }, { hold: HeldKey.hold })
              .then(() => setWhere({ screen: "paper", groups: paperGroups(paperCode) }))
              .catch((e: Error) => fail(e.message))
              .finally(() => setBusy(false));
          },
        });
      case "paper":
        return h(PaperCode, {
          say,
          groups: where.groups,
          busy,
          error,
          onDone: () => {
            setError(undefined);
            setBusy(true);
            client.confirmPaperCode()
              // The node's own numbers, once there is a session to ask with.
              .then(() => client.limits().then((l) => setLimit(l.phrase_length)).catch(() => {}))
              .then(() => setWhere({ screen: "location" }))
              .catch((e: Error) => fail(e.message))
              .finally(() => setBusy(false));
          },
        });
      case "changePin":
        return h(ChangePin, { say, client, onBack: me, onError: fail });
      case "reset":
        return h(StartAgain, {
          say,
          client,
          onClosed: () => {
            if (!fresh) process.exit(0);
            // Everything this process knew belonged to the closed identity.
            setClient(fresh());
            setPlace(undefined);
            setMine(undefined);
            setStatements(null);
            setError(undefined);
            setWhere({ screen: "register" });
          },
          onBack: me,
          onError: fail,
        });
      case "move":
        return h(MoveOut, { say, client, onMoved: () => setWhere({ screen: "movedAway" }), onBack: me, onError: fail });
      case "movedAway":
        return h(MovedAway, { say });
      case "moveIn":
        return h(MoveIn, {
          say,
          client,
          // What this device calls itself on the other screen: its word, and
          // shown there as such (§8.2 "назвалось").
          label: `depth, ${process.platform}`,
          onArrived: () => setWhere({ screen: "arrivedPin" }),
          onBack: () => setWhere({ screen: "register" }),
          onError: fail,
        });
      case "arrivedPin":
        return h(ArrivedPin, {
          say,
          busy,
          error,
          onDone: (pin) => {
            setError(undefined);
            setBusy(true);
            client.firstPin(pin)
              .then((answer) => {
                if (answer.status !== 204) throw new Error(`the first PIN was refused: ${answer.status}`);
                return client.limits().then((l) => setLimit(l.phrase_length)).catch(() => {});
              })
              .then(() => setWhere({ screen: "location" }))
              .catch((e: Error) => fail(e.message))
              .finally(() => setBusy(false));
          },
        });
      case "location":
        // Straight to the feed: `feed` reads `place` of this render, which the
        // point just set is not in yet.
        return h(Location, { say, place, onDone: (next) => { setPlace(next); setWhere({ screen: "feed" }); }, density: (at) => client.density(at) });
      case "complaint":
        return h(Complaint, { say, client, offerId: where.offerId, onBack: () => setWhere({ screen: "feed" }) });
      case "feed":
        return h(Feed, {
          say,
          client,
          place: place!,
          mine,
          onWrite: () => setWhere({ screen: "write" }),
          onInbox: () => setWhere({ screen: "inbox" }),
          onPoint: () => setWhere({ screen: "location" }),
          onMe: () => setWhere({ screen: "me" }),
          onTable: () => setWhere({ screen: "newTable" }),
          onComplain: (offerId) => setWhere({ screen: "complaint", offerId }),
          // My own phrase came down from the feed's row (W11-B): nothing to show.
          onTakenDown: () => setMine(undefined),
          // Sitting down at a table from the feed (G1h): the seat first, then
          // the live table; a refusal (unavailable, already seated) is said.
          onOpenTable: (id) =>
            void new Tables(client).sit(id)
              .then((a) => {
                if (a.status >= 400) {
                  const e = (a.body as { error?: { code?: string; table?: string } } | null)?.error;
                  // Seated at another table: the node names it (C5).
                  if (e?.code === "already_seated" && typeof e.table === "string") {
                    return setWhere({ screen: "seatedElsewhere", there: e.table, here: id });
                  }
                  return fail(`${say("table.refused")}: ${plain(e?.code ?? a.status, 80)}`);
                }
                setWhere({ screen: "table", id });
              })
              .catch((e: Error) => fail(e.message)),
          onError: fail,
        });
      case "newTable":
        return h(NewTable, {
          say,
          tables: new Tables(client),
          place: place!,
          onSet: (id) => setWhere({ screen: "table", id }),
          onBack: feed,
        });
      case "seatedElsewhere":
        return h(SeatedElsewhere, {
          say,
          tables: new Tables(client),
          there: where.there,
          here: where.here,
          onOpen: (id) => setWhere({ screen: "table", id }),
          onBack: feed,
          onError: fail,
        });
      case "table":
        return h(TableRoom, {
          say,
          tables: new Tables(client),
          open: (id) => openTable(client, id),
          tableId: where.id,
          onLeave: feed,
          onError: fail,
        });
      case "write":
        return h(Write, {
          say,
          client,
          place: place!,
          limit,
          onDone: (text, id) => { setMine({ id, text, state: "pending" }); feed(); },
          onBack: feed,
          onError: fail,
        });
      case "statements":
        // Shown by itself on the first entry to the feed, it folds back into
        // the feed; opened from "me", it goes back there.
        return h(Statements, {
          say,
          lang: languageOf(process.env),
          items: statements ?? [],
          onDone: where.from === "me" ? me : feed,
        });
      case "me":
        return h(Me, {
          say,
          client,
          restrictions: statements?.length ?? 0,
          onOpen: (row, current) => {
            // A line from the screen left behind is not about the one opened.
            setError(undefined);
            setWhere(
              row === "statements" ? { screen: "statements", from: "me" }
              : row === "away" ? { screen: "stepAway" }
              : row === "name" || row === "age" ? { screen: "edit", field: row, current: current ?? "" }
              : row === "pin" ? { screen: "changePin" }
              : { screen: row },
            );
          },
          onBack: feed,
          onError: fail,
        });
      case "edit":
        return h(EditProfile, {
          say,
          client,
          field: where.field,
          current: where.current,
          onDone: me,
          onBack: me,
          onError: fail,
        });
      case "stepAway":
        return h(StepAway, {
          say,
          client,
          onGone: (until) => setWhere({ screen: "away", until }),
          onBack: me,
          onError: fail,
        });
      case "away":
        return h(Away, { say, client, until: where.until, onBack: feed, onError: fail });
      case "blocked":
        return h(Blocked, { say, lang: languageOf(process.env), client, onBack: me, onError: fail });
      case "liked":
        return h(Liked, { say, client, onInbox: () => setWhere({ screen: "inbox" }), onBack: me, onError: fail });
      case "hidden":
        return h(Hidden, { say, client, onBack: me, onError: fail });
      case "inbox":
        return h(Inbox, {
          say,
          client,
          onOpen: (chatId, matchId, name, age, span, endsAt) =>
            setWhere({ screen: "chat", chatId, matchId, name, age, span, endsAt }),
          onWait: (matchId, name, age) => {
            setConsented((all) => new Set(all).add(matchId));
            setWhere({ screen: "waiting", matchId, name, age });
          },
          consented: (matchId) => consented.has(matchId),
          onBack: feed,
          onError: fail,
        });
      case "waiting":
        return h(Waiting, {
          say,
          client,
          matchId: where.matchId,
          name: where.name,
          age: where.age,
          limit,
          onOpened: (chatId, matchId, name, age) => setWhere({ screen: "chat", chatId, matchId, name, age }),
          onBack: () => setWhere({ screen: "inbox" }),
          onFeed: feed,
          onError: fail,
        });
      // ── B1 · raising with the paper code, and trading it for a new one ──
      case "restore":
        return h(PaperCodeEntry, {
          say,
          title: say("restore.title"),
          lines: [say(client.registered ? "restore.introHere" : "restore.intro")],
          go: say("restore.go"),
          busy,
          error,
          onBack: client.registered ? me : undefined,
          onComeBack: comeBack,
          onDone: (code) => {
            setError(undefined);
            setAway(false);
            setBusy(true);
            // Held as registration holds it, or a raised identity could never
            // move on (verifier, 26.09.2026).
            raise(client, code, { label: "depth", hold: HeldKey.hold })
              .then((o) => {
                if (!o.ok) return refused(o);
                // §8.2: on this device the old PIN opens it again, the counter
                // back at ten; a new PIN is for a device that never had one.
                if (o.sameDevice) {
                  const next = newPaperCode();
                  return setWhere({ screen: "raisedHere", old: code, next, groups: paperGroups(next) });
                }
                setWhere({ screen: "restorePin", old: code });
              })
              .catch((e: Error) => fail(e.message))
              .finally(() => setBusy(false));
          },
        });
      case "raisedHere":
        return h(RaisedHere, {
          say,
          // A line the PIN screen left behind is not about the code (verifier of P6).
          onKeep: () => {
            setError(undefined);
            setWhere({ screen: "newPaper", old: where.old, next: where.next, groups: where.groups });
          },
          onNewPin: () => {
            setError(undefined);
            setWhere({ screen: "raisedHerePin", old: where.old, next: where.next, groups: where.groups });
          },
        });
      case "raisedHerePin":
        return h(RaisedHerePin, {
          say,
          busy,
          error,
          onBack: () => {
            setError(undefined);
            setWhere({ screen: "raisedHere", old: where.old, next: where.next, groups: where.groups });
          },
          // The grant the same-device claim left takes the new PIN (POST
          // /vault/init, recovery.test.ts "lifted by the paper code on the same
          // device"); then the code is traded as on every other way back.
          onDone: (pin) => {
            setError(undefined);
            setBusy(true);
            client.firstPin(pin)
              .then((a) =>
                a.status === 204
                  ? setWhere({ screen: "newPaper", old: where.old, next: where.next, groups: where.groups })
                  : refused(refusal(a))
              )
              .catch((e: Error) => fail(e.message))
              .finally(() => setBusy(false));
          },
        });
      case "restorePin":
        return h(PinSet, {
          say,
          busy,
          error,
          onComeBack: comeBack,
          // The claim left a first-PIN grant; the new PIN takes it, and then
          // the old code is traded, as §8.2 draws the way back.
          onDone: (pin) => {
            setError(undefined);
            setAway(false);
            setBusy(true);
            const next = newPaperCode();
            client.firstPin(pin)
              .then((a) =>
                a.status === 204
                  ? setWhere({ screen: "newPaper", old: where.old, next, groups: paperGroups(next) })
                  : refused(refusal(a))
              )
              .catch((e: Error) => fail(e.message))
              .finally(() => setBusy(false));
          },
        });
      case "reissue":
        return h(PaperCodeEntry, {
          say,
          title: say("reissue.title"),
          lines: [say("reissue.intro")],
          go: say("reg.next"),
          busy,
          error,
          onBack: me,
          onComeBack: comeBack,
          // The current code is checked before a new one is shown: a new code
          // written down under a wrong current one would never become real.
          onDone: (code) => {
            setError(undefined);
            setAway(false);
            setBusy(true);
            isCurrentCode(client, code)
              .then((right) => {
                if (!right) return setError(say("restore.noMatch"));
                const next = newPaperCode();
                setWhere({ screen: "newPaper", old: code, next, groups: paperGroups(next) });
              })
              .catch((e: Error) => fail(e.message))
              .finally(() => setBusy(false));
          },
        });
      case "newPaper":
        return h(PaperCode, {
          say,
          groups: where.groups,
          busy,
          error,
          // Confirmed on paper: the node takes the new code and drops the old
          // in one transaction. A refusal sends the person back to the old one.
          onDone: () => {
            setError(undefined);
            setBusy(true);
            reissue(client, where.old, where.next)
              .then((o) => {
                // Refused after the identity is up: back to the current code,
                // never to raising it again (the old device is frozen by now).
                if (!o.ok) {
                  setWhere({ screen: "reissue" });
                  return refused(o);
                }
                if (place) return me();
                return client.limits().then((l) => setLimit(l.phrase_length)).catch(() => {})
                  .then(() => setWhere({ screen: "location" }));
              })
              .catch((e: Error) => fail(e.message))
              .finally(() => setBusy(false));
          },
        });
      case "chat":
        return h(Chat, {
          say,
          client,
          chatId: where.chatId,
          matchId: where.matchId,
          name: where.name,
          age: where.age,
          span: where.span,
          endsAt: where.endsAt,
          limit,
          onBack: () => setWhere({ screen: "inbox" }),
          onFeed: feed,
          onError: fail,
          onClosed: (code) => setClosedWith(code === 4002 ? 4002 : 4004),
        });
    }
  })();

  if (closedWith !== null) return h(Closed, { say, code: closedWith, onExit: () => process.exit(0) });
  if (locked) {
    // One line and nothing else — no error of the screen left behind either.
    return h(Lock, {
      say,
      client,
      hold: HeldKey.hold,
      onUnlocked: () => {
        setLocked(false);
        timer.current?.touch();
      },
      onError: fail,
    });
  }
  return h(
    Box,
    { flexDirection: "column" },
    body,
    error && !["register", "pin", "paper", "restore", "restorePin", "raisedHerePin", "reissue", "newPaper", "arrivedPin"].includes(where.screen) ? h(Text, { color: "red" }, error) : null,
  );
}

// The device the identity arrived at: what is here and what is not (§8.2 —
// "здесь пока пусто", and the conversations silent until their key is
// reissued), then its first PIN.
function ArrivedPin(
  { say, onDone, busy, error }: { say: Say; onDone: (pin: string) => void; busy?: boolean; error?: string },
): ReactElement {
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, { bold: true }, say("move.arrivedTitle")),
    h(Text, { dimColor: true }, say("move.arrived")),
    h(PinSet, { say, onDone, busy, error }),
  );
}
