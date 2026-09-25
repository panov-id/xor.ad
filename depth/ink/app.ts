// The terminal face: which screen is on, and nothing else. Every fact it
// holds — the identity, the point, the phrase, the conversation — lives in
// this process and dies with it (§8.13, and the owner's decision about the
// point, 2026-09-22).

import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import { Client } from "../core/client.ts";
import type { Statement } from "../core/client.ts";
import { newPaperCode, paperGroups } from "../core/paper.ts";
import { languageOf } from "./strings.ts";
import type { Say } from "./strings.ts";
import { Feed, Location, PaperCode, PinSet, Registration } from "./screens.ts";
import type { Place } from "./screens.ts";
import {
  Away, Blocked, ChangePin, Chat, EditProfile, Hidden, Inbox, Liked, Me, StartAgain, StepAway, Statements, Write,
} from "./rooms.ts";

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
  | { screen: "chat"; chatId: string; matchId?: string; name: string; age: number; span?: number; endsAt?: number };

// `fresh` makes the client a new identity starts on: "start again" closes this
// one for good (§8.2), and the next is someone else, keys and all. Without it
// the process ends there.
export function App({ say, client: first, fresh }: { say: Say; client: Client; fresh?: () => Client }): ReactElement {
  const [client, setClient] = useState(first);
  const [where, setWhere] = useState<Where>({ screen: "register" });
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(LENGTH_UNTIL_THE_NODE_SPEAKS);
  const [place, setPlace] = useState<Place | undefined>(undefined);
  const [mine, setMine] = useState<{ text: string; state: string } | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const fail = (message: string) => setError(say("common.error", { message }));
  // Read once a run, when the feed is first reached: with no e-mail on file,
  // the app is where an Article 17 statement is delivered (dsa/SPEC §7), and
  // the first time they arrive they are shown whole, not as a count.
  const [statements, setStatements] = useState<Statement[] | null>(null);
  useEffect(() => {
    if (where.screen !== "feed" || statements !== null) return;
    client.statements()
      .then((items) => {
        setStatements(items);
        if (items.length > 0) setWhere({ screen: "statements" });
      })
      .catch((e: Error) => fail(e.message));
  }, [where.screen]);

  const feed = () => setWhere({ screen: "feed" });
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
            client.register({ name: where.name, age: where.age }, { pin, paperCode })
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
      case "location":
        return h(Location, { say, place, onDone: (next) => { setPlace(next); feed(); } });
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
          onError: fail,
        });
      case "write":
        return h(Write, {
          say,
          client,
          place: place!,
          limit,
          onDone: (text) => { setMine({ text, state: "pending" }); feed(); },
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
          onOpen: (row, current) =>
            setWhere(
              row === "statements" ? { screen: "statements", from: "me" }
              : row === "away" ? { screen: "stepAway" }
              : row === "name" || row === "age" ? { screen: "edit", field: row, current: current ?? "" }
              : row === "pin" ? { screen: "changePin" }
              : { screen: row },
            ),
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
          onBack: feed,
          onError: fail,
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
        });
    }
  })();

  return h(
    Box,
    { flexDirection: "column" },
    body,
    error && !["register", "pin", "paper"].includes(where.screen) ? h(Text, { color: "red" }, error) : null,
  );
}
