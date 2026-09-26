// The paper code used on this very device (chat spec §8.2; depth.pin.forgot
// .samedevice): the claim lifted the tenth mistake and left a first-PIN grant,
// so the person may keep the PIN they have — or, having forgotten it, set a
// new one under that grant. Before this screen the device went straight on to
// the new paper code and the grant went unused; a forgotten PIN then meant
// the same ten misses all over again.
import { createElement as h } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Say } from "../strings.ts";
import { Head, Menu } from "../parts.ts";
import { PinSet } from "../screens.ts";

export function RaisedHere({ say, onKeep, onNewPin }: { say: Say; onKeep: () => void; onNewPin: () => void }): ReactElement {
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("restore.hereTitle"), lines: [say("restore.hereIntro")] }),
    h(Menu, {
      actions: [
        { key: "keep", label: say("restore.keepPin") },
        { key: "new", label: say("restore.forgotPin") },
      ],
      onPick: (key) => (key === "keep" ? onKeep() : onNewPin()),
      hint: say("common.rowActions"),
    }),
  );
}

// The new PIN under the grant: what it costs is said first (owner.md, 26.09
// 10:15 (б) — with no volume there is no history here to lose), then six
// digits twice as at registration.
export function RaisedHerePin(
  { say, onDone, onBack, busy, error }: { say: Say; onDone: (pin: string) => void; onBack: () => void; busy?: boolean; error?: string },
): ReactElement {
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, { bold: true }, say("restore.forgotPin")),
    h(Text, { color: "yellow" }, say("restore.newPinPrice")),
    // The way back to the choice rides PinSet's "come back" action: same key, same place.
    h(PinSet, { say, onDone, onComeBack: onBack, busy, error }),
  );
}
