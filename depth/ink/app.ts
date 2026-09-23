// The terminal face: which screen is on, and nothing else. Every fact it
// holds — the identity, the point, the phrase, the conversation — lives in
// this process and dies with it (§8.13, and the owner's decision about the
// point, 2026-09-22).

import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import { Client } from "../core/client.ts";
import type { Statement } from "../core/client.ts";
import { languageOf } from "./strings.ts";
import type { Say } from "./strings.ts";
import { Feed, Location, Registration } from "./screens.ts";
import type { Place } from "./screens.ts";
import { Chat, Hidden, Inbox, Liked, Statements, Write } from "./rooms.ts";

// The phrase's length is the node's to state (§8.3). Until GET /limits
// answers, the screen uses this number — and it is the registry's 128
// (limits.tsv phrase.length), not the 146 the terminal used to carry against
// a node that refused at 128 (review panel, 2026-09-22).
const LENGTH_UNTIL_THE_NODE_SPEAKS = 128;

// The core refuses to register while the PIN and the paper code are
// placeholders, and it is right to: a person registered this way can never
// unlock or recover (depth-core panel, 2026-09-21). The image therefore does
// not register anyone unless the run says out loud that it is a test stand —
// the shipped terminal used to pass the escape hatch itself (security lens,
// 2026-09-22).
const TEST_ONLY = process.env.DEPTH_TEST_ONLY === "1";

type Where =
  | { screen: "register" }
  | { screen: "location" }
  | { screen: "feed" }
  | { screen: "write" }
  | { screen: "inbox" }
  | { screen: "hidden" }
  | { screen: "statements" }
  | { screen: "liked" }
  | { screen: "chat"; chatId: string; matchId?: string; name: string; age: number };

export function App({ say, client }: { say: Say; client: Client }): ReactElement {
  const [where, setWhere] = useState<Where>({ screen: "register" });
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
  const body = (() => {
    switch (where.screen) {
      case "register":
        return h(Registration, {
          say,
          error,
          onDone: (name, age) => {
            setError(undefined);
            client.register({ name, age }, { testOnly: TEST_ONLY })
              .then(() => client.confirmPaperCode())
              // The node's own numbers, once there is a session to ask with.
              .then(() => client.limits().then((l) => setLimit(l.phrase_length)).catch(() => {}))
              .then(() => setWhere({ screen: "location" }))
              .catch((e: Error) => fail(e.message));
          },
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
          onHidden: () => setWhere({ screen: "hidden" }),
          onLiked: () => setWhere({ screen: "liked" }),
          restrictions: statements?.length ?? 0,
          onRestrictions: () => setWhere({ screen: "statements" }),
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
        return h(Statements, { say, lang: languageOf(process.env), items: statements ?? [], onDone: feed });
      case "liked":
        return h(Liked, { say, client, onInbox: () => setWhere({ screen: "inbox" }), onBack: feed, onError: fail });
      case "hidden":
        return h(Hidden, { say, client, onBack: feed, onError: fail });
      case "inbox":
        return h(Inbox, {
          say,
          client,
          onOpen: (chatId, matchId, name, age) => setWhere({ screen: "chat", chatId, matchId, name, age }),
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
          limit,
          onBack: () => setWhere({ screen: "inbox" }),
          onError: fail,
        });
    }
  })();

  return h(
    Box,
    { flexDirection: "column" },
    body,
    error && where.screen !== "register" ? h(Text, { color: "red" }, error) : null,
  );
}
