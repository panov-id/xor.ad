// The pieces every screen is built from: a row of actions and a column of
// fields. Both are driven by arrows and enter only — the owner's decision of
// 2026-09-22 after seeing the mock-up; there are no letter shortcuts, so no
// key means one thing here and another there.
//
// No JSX: Node strips types but does not compile JSX, and the terminal face
// runs straight from source (package.json "start").

import { createElement as h, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useInput } from "ink";

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
  useInput((_input, key) => {
    if (!active || actions.length === 0) return;
    if (key.leftArrow) setAt((i) => (i - 1 + actions.length) % actions.length);
    if (key.rightArrow) setAt((i) => (i + 1) % actions.length);
    if (key.return) {
      const action = actions[Math.min(at, actions.length - 1)];
      if (action && action.disabled !== true) onPick(action.key);
    }
  });
  const chosen = actions[Math.min(at, actions.length - 1)];
  return h(
    Box,
    { flexDirection: "column" },
    h(
      Box,
      { gap: 2 },
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

export type Field = { key: string; label: string; value: string; choices?: string[] };

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
  useInput((input, key) => {
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
        f.choices ? `‹ ${f.value} ›` : f.value,
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
  useInput((_input, key) => {
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
