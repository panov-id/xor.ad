// The two closes that end the session, not the room (protocol §4.4,
// core/reconnect.ts): 4002 — the identity was moved to another device, and
// this one has nothing left to sign with; 4004 — the node no longer speaks this
// version of the protocol, and only a newer depth will. Neither reconnects;
// each says why and offers the one way out.
import { createElement as h } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Say } from "../strings.ts";
import { Head, Menu } from "../parts.ts";

export type SessionClose = 4002 | 4004;

export function Closed({ say, code, onExit }: { say: Say; code: SessionClose; onExit: () => void }): ReactElement {
  const moved = code === 4002;
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say(moved ? "closed.movedTitle" : "closed.updateTitle") }),
    h(Text, { color: moved ? "yellow" : "red" }, say(moved ? "closed.moved" : "closed.update")),
    h(Menu, { actions: [{ key: "exit", label: say("common.exit") }], onPick: onExit, hint: say("common.rowActions") }),
  );
}
