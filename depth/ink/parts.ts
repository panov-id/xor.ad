// What every screen takes keys and text through; the drawing itself is kit.ts.
// The screens are driven by arrows and enter only — the owner's decision of
// 2026-09-22 after seeing the mock-up; there are no letter shortcuts, so no
// key means one thing here and another there.
//
// No JSX: Node strips types but does not compile JSX, and the terminal face
// runs straight from source (package.json "start").

import { useEffect, useLayoutEffect, useRef } from "react";
import { useInput, useStdin } from "ink";
// Imported, not taken as a global: the screens run in Node, but their type
// check runs in Deno, which knows Node's timers only by module (T23b).
import { setImmediate } from "node:timers";

type KeyHandler = Parameters<typeof useInput>[0];
type Keypress = Parameters<KeyHandler>;

// Keys, one at a time, each against the screen the previous one left.
//
// React draws a state change in a later turn of the event loop (a
// setImmediate: the Scheduler's task), and Ink hands each key to the handler
// of the last render. A key that arrives in the same turn as the one before —
// typed fast, over a slow ssh, or by a test whose timer came due together with
// React's task — meets the old handler: the old cursor, the old `disabled`,
// the old row of actions, the old text of a field. Measured on 26.09.2026
// (ink 6, node 24): an arrow and enter with no gap picked the neighbour 5 of
// 5 times, with one setImmediate between them the right row 5 of 5, and the
// live run under load opened "сменить точку" with the cursor drawn on "я".
//
// So every screen takes keys through useKeys, and the keys of one terminal go
// through one queue: the first is handed out at once, each next one only
// after a microtask and a setImmediate — after the draw the previous key
// caused. The handler is kept in a ref refreshed at layout time, so the one
// the next key meets is the one just drawn, and a screen mounted by the
// previous key is already listening. It is the order of the event loop's
// phases, not a pause: a loaded machine makes it slower, never wrong.
interface Gate {
  // In the order the screens mounted — children before their parents, as
  // their layout effects run, which is the order Ink itself calls them in.
  listeners: Array<{ current: KeyHandler }>;
  queue: Keypress[];
  busy: boolean;
  // Every useKeys subscribes to Ink so that keys keep coming whichever screen
  // is up; Ink then calls all of them for one key, and only the first call of
  // each round puts the key in the queue.
  subscribed: number;
  turn: number;
}
const gates = new WeakMap<object, Gate>();
// A person does not type ahead of the screen by more than this; a paste or a
// key held down past it is cut, not queued without end.
export const KEYS_AHEAD = 32;

function gateOf(stdin: object): Gate {
  let gate = gates.get(stdin);
  if (!gate) gates.set(stdin, gate = { listeners: [], queue: [], busy: false, subscribed: 0, turn: 0 });
  return gate;
}

function drain(gate: Gate): void {
  const next = gate.queue.shift();
  if (!next) {
    gate.busy = false;
    return;
  }
  gate.busy = true;
  for (const listener of [...gate.listeners]) listener.current(...next);
  queueMicrotask(() => setImmediate(() => drain(gate)));
}

export function useKeys(handler: KeyHandler): void {
  const { stdin } = useStdin();
  const gate = gateOf(stdin);
  const live = useRef(handler);
  useLayoutEffect(() => {
    live.current = handler;
  });
  useLayoutEffect(() => {
    gate.listeners.push(live);
    return () => {
      gate.listeners.splice(gate.listeners.indexOf(live), 1);
    };
  }, [gate]);
  const arrive = useRef<KeyHandler>((input, key) => {
    if (gate.turn++ % gate.subscribed !== 0) return;
    if (gate.queue.length >= KEYS_AHEAD) return;
    gate.queue.push([input, key]);
    if (!gate.busy) drain(gate);
  }).current;
  useInput(arrive);
  // Right after Ink's own subscription, in the same effect phase, so the count
  // is the number of Ink listeners whenever a key comes.
  useEffect(() => {
    gate.subscribed++;
    gate.turn = 0;
    return () => {
      gate.subscribed--;
      gate.turn = 0;
    };
  }, [gate]);
}

// `why` is a disabled action's reason, already said in words (kit.ts `off`):
// the plain face has no dimming, so it writes the reason after the label (Т15).
export type Action = { key: string; label: string; disabled?: boolean; why?: string };

// Anything the node hands over — a name, an age, a phrase, a decrypted line —
// is drawn through this. The node is the adversary here (§8.13): an escape
// sequence inside a name can repaint the screen, and the screen the person is
// told to trust is the one holding the safety code (security lens,
// 2026-09-22). Control characters and CSI/OSC sequences go; a printable ␛ is
// shown as a dot so nothing silently disappears. The bidirectional controls go
// too: an embedded right-to-left override lets a phrase reorder its own tail
// on the screen (security lens, 23.09.2026).
// deno-lint-ignore no-control-regex
const CONTROL = /\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B[@-Z\\-_]|\u001B\[[0-?]*[ -\/]*[@-~]|[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
export function plain(text: unknown, limit = 400): string {
  return String(text ?? "").replace(CONTROL, "·").slice(0, limit);
}
