// The pieces every screen is built from: a row of actions and a column of
// fields. Both are driven by arrows and enter only — the owner's decision of
// 2026-09-22 after seeing the mock-up; there are no letter shortcuts, so no
// key means one thing here and another there.
//
// No JSX: Node strips types but does not compile JSX, and the terminal face
// runs straight from source (package.json "start").

import { createElement as h, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useInput, useStdin } from "ink";

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

export type Action = { key: string; label: string; disabled?: boolean };

// A row of actions: left and right move, enter picks. The chosen one is the
// only one in brackets, because colour alone can be invisible over ssh.
export function Menu(
  { actions, onPick, hint, active = true }: { actions: Action[]; onPick: (key: string) => void; hint?: string; active?: boolean },
): ReactElement {
  const [at, setAt] = useState(0);
  // A disabled action keeps its place in the row and simply does not fire.
  // Dropping it from the cycle moved every other action under the cursor —
  // with the first one disabled, enter landed on "quit" and killed the
  // process (caught by the screens' own test, 2026-09-22).
  useKeys((_input, key) => {
    if (!active || actions.length === 0) return;
    // The row stops at its ends rather than wrapping: with "выход" last, a
    // wrap put quitting one keypress away from the first action, and a person
    // reaching left for "лайк" would land on it (23.09.2026).
    if (key.leftArrow) setAt((i) => Math.max(0, i - 1));
    if (key.rightArrow) setAt((i) => Math.min(actions.length - 1, i + 1));
    if (key.return) {
      const action = actions[Math.min(at, actions.length - 1)];
      if (action && action.disabled !== true) onPick(action.key);
    }
  });
  const chosen = actions[Math.min(at, actions.length - 1)];
  return h(
    Box,
    { flexDirection: "column" },
    // Wrapped by whole actions: the feed's row outgrew a hundred columns, and
      // Ink then broke labels mid-word ("заблокиров / ать") — measured in the
      // screens' test, 23.09.2026.
    h(
      Box,
      { columnGap: 2, flexWrap: "wrap" },
      ...actions.map((a) =>
        h(
          Text,
          { key: a.key, dimColor: a.disabled === true },
          a.key === chosen?.key ? `[ ${a.label} ]` : `  ${a.label}  `,
        )
      ),
    ),
    hint ? h(Text, { dimColor: true }, hint) : null,
  );
}

// `secret` draws the value as dots: a PIN on the screen is a PIN for whoever
// stands behind the chair.
export type Field = { key: string; label: string; value: string; choices?: string[]; secret?: boolean };

// A column of fields: up and down move between them, typing edits the one in
// hand, and a field with choices is turned by left and right instead.
export function Fields(
  { fields, onChange, hint, active = true, at: outerAt, onMove }: {
    fields: Field[];
    onChange: (key: string, value: string) => void;
    hint?: string;
    active?: boolean;
    at?: number;
    onMove?: (at: number) => void;
  },
): ReactElement {
  const [innerAt, setInnerAt] = useState(0);
  const at = outerAt ?? innerAt;
  const setAt = (fn: (i: number) => number) => (onMove ? onMove(fn(at)) : setInnerAt(fn));
  const current = fields[Math.min(at, fields.length - 1)];
  useKeys((input, key) => {
    if (!active) return;
    if (key.upArrow) return setAt((i) => (i - 1 + fields.length) % fields.length);
    if (key.downArrow || key.tab) return setAt((i) => (i + 1) % fields.length);
    if (!current) return;
    if (current.choices) {
      const i = current.choices.indexOf(current.value);
      if (key.leftArrow) onChange(current.key, current.choices[(i - 1 + current.choices.length) % current.choices.length]);
      if (key.rightArrow) onChange(current.key, current.choices[(i + 1) % current.choices.length]);
      return;
    }
    if (key.backspace || key.delete) return onChange(current.key, current.value.slice(0, -1));
    // Control keys arrive as escape sequences; they are not text.
    if (input && !key.ctrl && !key.meta && !key.escape && !key.return) onChange(current.key, current.value + input);
  });
  const width = Math.max(...fields.map((f) => f.label.length));
  return h(
    Box,
    { flexDirection: "column" },
    ...fields.map((f) =>
      h(
        Text,
        { key: f.key },
        `  ${f.label.padEnd(width)} ${f.key === current?.key ? ">" : " "} `,
        f.choices ? `‹ ${f.value} ›` : f.secret ? "•".repeat(f.value.length) : f.value,
        f.key === current?.key && !f.choices ? "_" : "",
      )
    ),
    hint ? h(Text, { dimColor: true }, hint) : null,
  );
}

// One line of prose with a rule under it: every screen's head.
export function Head({ title, lines }: { title: string; lines?: string[] }): ReactElement {
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { bold: true }, title),
    ...(lines ?? []).map((line, i) => h(Text, { key: i, dimColor: true }, line)),
    h(Text, { dimColor: true }, "─".repeat(78)),
  );
}

// A screen is a column of fields with a row of actions under it. Only one of
// the two hears the arrows at a time: down from the last field moves into the
// row, up from the row returns to the fields. Without that, turning a field
// with left and right also moved the row's cursor — and enter then quit the
// program instead of going on (caught by the screens' test, 2026-09-22).
export function Form(
  { fields, onChange, actions, onPick, fieldsHint, actionsHint, active = true }: {
    fields: Field[];
    onChange: (key: string, value: string) => void;
    actions: Action[];
    onPick: (key: string) => void;
    fieldsHint?: string;
    actionsHint?: string;
    active?: boolean;
  },
): ReactElement {
  const [at, setAt] = useState(0);
  const onMenu = at >= fields.length;
  useKeys((_input, key) => {
    if (!active) return;
    if (onMenu && key.upArrow) setAt(fields.length - 1);
    else if (!onMenu && key.downArrow && at === fields.length - 1) setAt(fields.length);
  });
  return h(
    Box,
    { flexDirection: "column" },
    h(Fields, {
      fields,
      onChange,
      hint: fieldsHint,
      active: active && !onMenu,
      at: Math.min(at, fields.length - 1),
      onMove: (next) => setAt(Math.max(0, Math.min(next, fields.length - 1))),
    }),
    h(Menu, { actions, onPick, hint: actionsHint, active: active && onMenu }),
  );
}

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
