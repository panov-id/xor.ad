// `depth move` — the identity to another device and back into this one
// (chat spec §8.2, screen 13). Four screens: the PIN and the code on the old
// device, the confirmation with its context there, the code typed on the new
// one, and the frozen end on the old. The core does the keys
// (depth/core/transfer_move.ts); this layer only shows and asks.
//
// Both sides ask the node every five seconds, one question at a time: the
// state route has its own allowance per address (relay/node/src/lib/
// rate_limit.ts TRANSFER_STATE_LIMITS, 600 an hour), and two devices in one
// home are one address — a two-minute window asked by both is 48 of it. A
// 429 keeps the screen as it is until the time the node named.

import { createElement as h, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Answer } from "../core/client.ts";
import { readPaperText } from "../core/paper.ts";
import { Arrival, Departure, type MoveClient, type MoveState } from "../core/transfer_move.ts";
import type { Say } from "./strings.ts";
import { pinMismatch } from "./screens.ts";
import { Form, Head, Menu, plain } from "./parts.ts";

export const MOVE_POLL_MS = 5000;

export type MovingClient = MoveClient & { pinProof(pin: string): Promise<Uint8Array> };

// The same refusals as every other proof of the PIN, in the same words.
function pinRefusal(say: Say, answer: Answer): string | null {
  const error = (answer.body as { error?: { code?: string; attempts_left?: number } } | null)?.error;
  if (error?.code === "pin_mismatch") return pinMismatch(say, error.attempts_left);
  if (error?.code === "pin_locked") return say("pin.locked");
  if (error?.code === "rate_limited") return say("pin.wait", { n: String(answer.retryAfter ?? "?") });
  return null;
}

// How a transfer that did not happen is told: one line per reason, and every
// one of them says the identity stayed where it was.
const endings: Partial<Record<MoveState, string>> = {
  rejected: "move.rejected",
  cancelled: "move.twice",
  expired: "move.expired",
  garbled: "move.garbled",
};

// Every `ms`, and never over itself: a tick that finds the last ask still
// out skips, so a slow node gets one question at a time instead of a pile of
// them that land together and decide the screen twice (review panel
// 2026-09-26, F1).
function useEvery(ms: number, fn: () => void | Promise<unknown>, on: boolean): void {
  const saved = useRef(fn);
  saved.current = fn;
  const out = useRef(false);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      if (out.current) return;
      out.current = true;
      void Promise.resolve(saved.current()).finally(() => (out.current = false));
    }, ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

// The old device: the price first, then the PIN, then the code; and once
// somebody has typed it, the confirmation with what this device knows.
export function MoveOut(
  { say, client, onMoved, onBack, onError, pollMs = MOVE_POLL_MS }: {
    say: Say;
    client: MovingClient;
    onMoved: () => void;
    onBack: () => void;
    onError: (message: string) => void;
    pollMs?: number;
  },
): ReactElement {
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [out, setOut] = useState<Departure | null>(null);
  const [state, setState] = useState<MoveState>("waiting");
  const [left, setLeft] = useState(0);

  const ask = () => {
    if (!out) return;
    return out.state()
      .then((next) => {
        // Whatever sent an envelope this code does not open is not asked
        // about: the code is killed at once rather than left to run out.
        if (next === "garbled") void out.reject().catch(() => {});
        // Approved is moved, however this screen learned it — the answer to
        // "it is me" or, when that answer was lost, the node asked again (F2).
        if (next === "approved") return onMoved();
        setState(next);
      })
      .catch((e: Error) => onError(e.message));
  };
  const open = !!out && (state === "waiting" || state === "claimed");
  useEvery(pollMs, ask, open);
  useEvery(1000, () => setLeft((n) => Math.max(0, n - 1)), open);
  // A code whose two minutes ran out here is gone there too; the node says so
  // on the next ask, and until then the screen does not pretend otherwise.

  const start = () => {
    setSending(true);
    setRefused(null);
    client.pinProof(pin)
      .then((proof) => {
        // The proof is made; the PIN itself has no further use here, and a
        // screen that keeps it keeps it for as long as the code is shown
        // (review panel 2026-09-26, F23). A refusal asks for it again.
        setPin("");
        return Departure.open(client, proof);
      })
      .then((opened) => {
        if (opened instanceof Departure) {
          setOut(opened);
          setLeft(opened.expiresIn);
          return;
        }
        const line = pinRefusal(say, opened);
        if (line) return setRefused(line);
        onError(`the transfer was refused: ${opened.status}`);
      })
      .catch((e: Error) => onError(e.message))
      .finally(() => setSending(false));
  };

  if (!out) {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Head, { title: say("move.title"), lines: [say("move.intro")] }),
      h(Text, { color: "yellow" }, say("move.price")),
      h(Form, {
        fields: [{ key: "pin", label: say("reset.pin"), value: pin, secret: true }],
        onChange: (_key, value) => setPin(value.replace(/\D/g, "").slice(0, 6)),
        actions: [
          { key: "go", label: say("move.go"), disabled: pin.length !== 6 || sending },
          { key: "back", label: say("common.back") },
        ],
        onPick: (key) => (key === "go" ? start() : onBack()),
        fieldsHint: say("common.rowFields"),
        actionsHint: say("common.rowActions"),
      }),
      sending ? h(Text, { dimColor: true }, "…") : null,
      refused ? h(Text, { color: "red" }, refused) : null,
    );
  }

  if (state === "claimed" && out.claimant) {
    return h(MoveConfirm, {
      say,
      label: out.claimant.label,
      check: out.check,
      seenAt: out.seenAt,
      onYes: () =>
        out.approve()
          // Refused — decided or run out while the person read the screen —
          // or no answer at all: the node says which, not this screen.
          .then((answer) => (answer.status === 200 ? onMoved() : ask()))
          .catch(() => ask()),
      onNo: () => out.reject().then(() => setState("rejected")).catch((e: Error) => onError(e.message)),
    });
  }

  const ending = endings[state];
  if (ending) {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Head, { title: say("move.title") }),
      h(Text, null, say(ending)),
      h(Menu, { actions: [{ key: "back", label: say("common.back") }], onPick: onBack, hint: say("common.rowActions") }),
    );
  }

  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("move.title"), lines: [say("move.codeWhere")] }),
    h(Text, { bold: true }, `      ${out.groups.join(" - ")}`),
    h(Text, { dimColor: true }, say("move.codeLife", { n: left })),
    h(Text, { color: "yellow" }, say("move.nobody")),
    h(Menu, {
      actions: [{ key: "back", label: say("move.stop") }],
      // Leaving the screen is not a refusal the node hears: the code simply
      // runs out, and §8.2 counts that as no transfer.
      onPick: onBack,
      hint: say("common.rowActions"),
    }),
  );
}

// J19 · the confirmation with its context (§8.2): who asked, when, the check
// characters, and what happens to this device — before "it is me", not after.
// "Назвалось", not "устройство": the label is the other side's word.
export function MoveConfirm(
  { say, label, check, seenAt, onYes, onNo, now = Date.now }: {
    say: Say;
    label: string;
    check: string;
    seenAt: number;
    // Answered when the node has answered: a refusal that leaves the claim
    // standing (a 503, a lost connection) gives the buttons back.
    onYes: () => void | Promise<unknown>;
    onNo: () => void | Promise<unknown>;
    now?: () => number;
  },
): ReactElement {
  const [pressed, setPressed] = useState(false);
  const seconds = Math.max(0, Math.round((now() - seenAt) / 1000));
  const row = (name: string, value: string) =>
    h(Text, null, `  ${name.padEnd(12)} ${value}`);
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("move.asks") }),
    h(
      Box,
      { flexDirection: "column" },
      row(say("move.called"), plain(label, 64) || "—"),
      row(say("move.when"), seconds < 10 ? say("move.justNow") : say("move.secondsAgo", { n: seconds })),
      row(say("move.check"), `${check} — ${say("move.checkAsk")}`),
    ),
    h(Text, null, say("move.leaves")),
    h(Text, { color: "yellow" }, say("move.price")),
    h(Text, { color: "yellow" }, say("move.nobody")),
    h(Menu, {
      actions: [
        { key: "yes", label: say("move.yes"), disabled: pressed },
        { key: "no", label: say("move.no"), disabled: pressed },
      ],
      onPick: (key) => {
        setPressed(true);
        const done = () => setPressed(false);
        void Promise.resolve(key === "yes" ? onYes() : onNo()).then(done, done);
      },
      hint: say("common.rowActions"),
    }),
  );
}

// What the old device says once the identity has left: the spec's own
// sentence (§8.2), and nothing to do here but leave.
export function MovedAway({ say }: { say: Say }): ReactElement {
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("move.doneTitle") }),
    h(Text, null, say("move.done")),
    h(Menu, { actions: [{ key: "exit", label: say("common.exit") }], onPick: () => process.exit(0), hint: say("common.rowActions") }),
  );
}

// The new device: the nine characters typed here — never an argument or an
// environment variable (§8.2) — then the check characters to compare, then the
// wait for "it is me" on the other screen.
export function MoveIn(
  { say, client, label, onArrived, onBack, onError, pollMs = MOVE_POLL_MS }: {
    say: Say;
    client: MoveClient;
    label: string;
    onArrived: () => void;
    onBack: () => void;
    onError: (message: string) => void;
    pollMs?: number;
  },
): ReactElement {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [into, setInto] = useState<Arrival | null>(null);
  const [state, setState] = useState<MoveState>("claimed");

  // Arrived once: the screen moves on a single time, whichever ask saw it.
  const arrived = useRef(false);
  const ask = () => {
    if (!into) return;
    return into.state()
      .then((next) => {
        setState(next);
        if (next === "approved" && !arrived.current) {
          arrived.current = true;
          onArrived();
        }
      })
      .catch((e: Error) => onError(e.message));
  };
  useEvery(pollMs, ask, !!into && state === "claimed");

  const clean = readPaperText(code);
  const claim = () => {
    setSending(true);
    setRefused(null);
    Arrival.claim(client, clean, label)
      .then((claimed) => {
        if (claimed instanceof Arrival) return setInto(claimed);
        // 404 is "does not match or has expired", one wording for both, and
        // 409 is the second claim that cancelled it (§8.2).
        if (claimed.status === 404) return setRefused(say("move.codeBad"));
        if (claimed.status === 409) return setRefused(say("move.twice"));
        // 429 is the claim's own limit — this address's allowance or the node's
        // shared brake (§8.2, claim.miss.*) — said as such, not in the PIN's
        // words (W12-C2); the code stays in the field for the retry.
        if (claimed.status === 429) return setRefused(say("restore.wait", { n: String(claimed.retryAfter ?? "?") }));
        onError(`the claim was refused: ${claimed.status}`);
      })
      .catch((e: Error) => onError(e.message))
      .finally(() => setSending(false));
  };

  if (!into) {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Head, { title: say("move.inTitle"), lines: [say("move.inIntro")] }),
      h(Form, {
        fields: [{ key: "code", label: say("move.code"), value: code }],
        onChange: (_key, value) => setCode(value.slice(0, 13)),
        actions: [
          { key: "go", label: say("reg.next"), disabled: clean.length !== 9 || sending },
          { key: "back", label: say("common.back") },
        ],
        onPick: (key) => (key === "go" ? claim() : onBack()),
        fieldsHint: say("common.rowFields"),
        actionsHint: say("common.rowActions"),
      }),
      sending ? h(Text, { dimColor: true }, say("move.deriving")) : null,
      refused ? h(Text, { color: "red" }, refused) : null,
    );
  }

  const ending = endings[state];
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("move.inTitle") }),
    ending
      ? h(Text, null, say(ending))
      : h(
        Box,
        { flexDirection: "column", gap: 1 },
        h(Text, null, `  ${say("move.check").padEnd(12)} ${into.check}`),
        h(Text, { dimColor: true }, say("move.inWait")),
      ),
    h(Menu, { actions: [{ key: "back", label: say("common.back") }], onPick: onBack, hint: say("common.rowActions") }),
  );
}
