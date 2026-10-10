// The terminal kit: the only file in depth/ink that draws. Screens do not call
// h(Box) or h(Text) — they ask for an element here (kit_RU.md §4), and a test
// (kit.test.ts) fails the day one does.
//
// The face's rules, from the spec:
//  - colour belongs to the terminal; the meaning is carried by a word and a
//    sign, so NO_COLOR loses nothing;
//  - focus is "> " in front of the element and inverse video;
//  - an error is a line that starts "ошибка:" (in the language of the screen),
//    never a bare "!";
//  - DEPTH_PLAIN=1: no alternate buffer, no frame glyphs (─ │), no ▋ block, and
//    a stream of lines instead of a redraw in place (main.ts passes ink's
//    `debug`). The alternate buffer is never used, plain or not;
//  - the key hint is a line of text at the bottom.
//
// No JSX: Node strips types but does not compile JSX (see parts.ts).

import { Children, createElement as h, useState } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Box, Text } from "ink";
import type { Action } from "./parts.ts";
import { useKeys } from "./parts.ts";
import type { Say } from "./strings.ts";

// DEPTH_PLAIN=1, read when drawn, so a test (or a person) can flip it between
// two renders.
export const isPlain = (): boolean => process.env.DEPTH_PLAIN === "1";

// The text caret. ▋ is a block and so a glyph of the rich face only; the plain
// face keeps the underscore, which is a letter-shaped character any reader
// takes as text.
export const caret = (): string => (isPlain() ? "_" : "▋");

// A rule between the head and the body. Plain: hyphens, not box drawing.
export const ruleOf = (width: number): string => (isPlain() ? "-" : "─").repeat(width);

const kids = (children: ReactNode): ReactNode[] => Children.toArray(children);

// ── Layout and text: the primitives every other element is made of ──

// No border props: a frame is Panel, which knows how to give it up (plain).
type BoxProps = Omit<ComponentProps<typeof Box>, "children" | "ref" | `border${string}`>;

export function Stack(props: BoxProps & { children?: ReactNode }): ReactElement {
  const { children, ...rest } = props;
  return h(Box, { flexDirection: "column", ...rest }, ...kids(children));
}

export function Row(props: BoxProps & { children?: ReactNode }): ReactElement {
  const { children, ...rest } = props;
  return h(Box, { flexDirection: "row", ...rest }, ...kids(children));
}

export function Txt(
  { bold, dim, inverse, color, children }: { bold?: boolean; dim?: boolean; inverse?: boolean; color?: string; children?: ReactNode },
): ReactElement {
  return h(Text, { bold, dimColor: dim, inverse, color }, ...kids(children));
}

// Secondary text: hints, counters, "…".
export function Muted({ children }: { children?: ReactNode }): ReactElement {
  return h(Txt, { dim: true }, children);
}

export function Strong({ children }: { children?: ReactNode }): ReactElement {
  return h(Txt, { bold: true }, children);
}

// A block set apart from the rest: a frame in the rich face; in plain, the
// same lines indented, because a frame is ─│ glyphs and a reader of text hears
// them as noise.
export function Panel({ children }: { children?: ReactNode }): ReactElement {
  return isPlain()
    ? h(Box, { flexDirection: "column", paddingLeft: 2 }, ...kids(children))
    : h(Box, { flexDirection: "column", borderStyle: "single", paddingX: 1 }, ...kids(children));
}

// A line with a mark in front of the one that holds the focus: "> " and
// inverse. The mark is a sign, so a monochrome terminal still tells.
export function Item(
  { on, bold, dim, color, children }: { on: boolean; bold?: boolean; dim?: boolean; color?: string; children?: ReactNode },
): ReactElement {
  return h(Txt, { inverse: on, bold: bold ?? false, dim, color }, on ? "> " : "  ", children);
}

export function Rule({ width = 78 }: { width?: number }): ReactElement {
  return h(Muted, null, ruleOf(width));
}

// ── Notices: the word comes first ──

export function ErrorLine({ say, children }: { say: Say; children?: ReactNode }): ReactElement {
  return h(Txt, { color: "red" }, `${say("kit.error")} `, children);
}

export function Notice({ say, children }: { say: Say; children?: ReactNode }): ReactElement {
  return h(Txt, { color: "yellow" }, `${say("kit.notice")} `, children);
}

// Nothing here yet: the title, then what to do about it.
export function Empty({ title, hint }: { title: string; hint?: string }): ReactElement {
  return h(Stack, null, h(Muted, null, title), hint ? h(Muted, null, hint) : null);
}

// ── Head ──

// One line of prose with a rule under it: every screen's head.
export function Head({ title, lines }: { title: string; lines?: string[] }): ReactElement {
  return h(
    Stack,
    null,
    h(Strong, null, title),
    ...(lines ?? []).map((line, i) => h(Muted, { key: i }, line)),
    h(Rule, null),
  );
}

// ── Actions: a row of buttons ──

// A row of actions: left and right move, enter picks. The chosen one is the
// only one in brackets, because colour alone can be invisible over ssh.
export function Actions(
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
    Stack,
    null,
    // Wrapped by whole actions: the feed's row outgrew a hundred columns, and
    // Ink then broke labels mid-word ("заблокиров / ать") — measured in the
    // screens' test, 23.09.2026.
    h(
      Row,
      { columnGap: 2, flexWrap: "wrap" },
      ...actions.map((a) =>
        // Brackets only on the row that hears the arrows: two bracketed rows
        // on one screen (a table's board and its row) left no telling which
        // one enter would fire (verifier, 2026-09-27).
        active && a.key === chosen?.key
          ? h(Txt, { key: a.key, inverse: true, dim: a.disabled === true }, `> [ ${a.label} ]`)
          : h(Txt, { key: a.key, dim: a.disabled === true }, `  ${a.label}  `)
      ),
    ),
    hint ? h(Muted, null, hint) : null,
  );
}

// ── Fields: a column of inputs ──

// `secret` draws the value as dots: a PIN on the screen is a PIN for whoever
// stands behind the chair.
export type FieldSpec = { key: string; label: string; value: string; choices?: string[]; secret?: boolean };

// The value of a choice, as Select draws it.
export const choiceText = (value: string): string => `‹ ${value} ›`;

// A column of fields: up and down move between them, typing edits the one in
// hand, and a field with choices is turned by left and right instead.
export function Fields(
  { fields, onChange, hint, active = true, at: outerAt, onMove, tab = true }: {
    fields: FieldSpec[];
    onChange: (key: string, value: string) => void;
    hint?: string;
    active?: boolean;
    // false where tab belongs to the screen around (a table's board and row):
    // the field then stays put (verifier, 2026-09-27).
    tab?: boolean;
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
    if (key.downArrow || (tab && key.tab)) return setAt((i) => (i + 1) % fields.length);
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
  const width = Math.max(...fields.map((f) => f.label.length)) + 1;
  return h(
    Stack,
    null,
    ...fields.map((f) => {
      // One mark on the screen: a column that does not hear the keys (the
      // focus is on the row of actions under it) carries none.
      const on = active && f.key === current?.key;
      return h(
        Item,
        { key: f.key, on },
        `${`${f.label}:`.padEnd(width)} `,
        f.choices ? choiceText(f.value) : f.secret ? "•".repeat(f.value.length) : f.value,
        on && !f.choices ? caret() : "",
      );
    }),
    hint ? h(Muted, null, hint) : null,
  );
}

// A screen is a column of fields with a row of actions under it. Only one of
// the two hears the arrows at a time: down from the last field moves into the
// row, up from the row returns to the fields. Without that, turning a field
// with left and right also moved the row's cursor — and enter then quit the
// program instead of going on (caught by the screens' test, 2026-09-22).
export function Form(
  { fields, onChange, actions, onPick, fieldsHint, actionsHint, active = true, tab = true }: {
    fields: FieldSpec[];
    onChange: (key: string, value: string) => void;
    actions: Action[];
    onPick: (key: string) => void;
    fieldsHint?: string;
    actionsHint?: string;
    active?: boolean;
    tab?: boolean;
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
    Stack,
    null,
    h(Fields, {
      fields,
      onChange,
      hint: fieldsHint,
      active: active && !onMenu,
      tab,
      at: Math.min(at, fields.length - 1),
      onMove: (next) => setAt(Math.max(0, Math.min(next, fields.length - 1))),
    }),
    h(Actions, { actions, onPick, hint: actionsHint, active: active && onMenu }),
  );
}

// ── Choosing ──

// One value out of several, turned by left and right: `‹ значение ›`.
export function Select(
  { label, value, choices, onChange, active = true }: {
    label: string;
    value: string;
    choices: string[];
    onChange: (value: string) => void;
    active?: boolean;
  },
): ReactElement {
  useKeys((_input, key) => {
    if (!active || choices.length === 0) return;
    const i = Math.max(0, choices.indexOf(value));
    if (key.leftArrow) onChange(choices[(i - 1 + choices.length) % choices.length]);
    if (key.rightArrow) onChange(choices[(i + 1) % choices.length]);
  });
  return h(Item, { on: active }, `${label}: ${choiceText(value)}`);
}

// A few options side by side, one chosen: `( ) один  (•) компанией`. Left and
// right move the choice, because the options are few and all in view.
export function Segments(
  { label, options, value, onChange, active = true }: {
    label?: string;
    options: Array<{ key: string; label: string }>;
    value: string;
    onChange: (key: string) => void;
    active?: boolean;
  },
): ReactElement {
  useKeys((_input, key) => {
    if (!active || options.length === 0) return;
    const i = Math.max(0, options.findIndex((o) => o.key === value));
    if (key.leftArrow) onChange(options[Math.max(0, i - 1)].key);
    if (key.rightArrow) onChange(options[Math.min(options.length - 1, i + 1)].key);
  });
  return h(
    Item,
    { on: active },
    label ? `${label}: ` : "",
    options.map((o) => `${o.key === value ? "(•)" : "( )"} ${o.label}`).join("  "),
  );
}

// A yes/no the person sets: `[x] текст`. Space flips it.
export function Check(
  { label, checked, onChange, active = true }: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    active?: boolean;
  },
): ReactElement {
  useKeys((input) => {
    if (active && input === " ") onChange(!checked);
  });
  return h(Item, { on: active }, `${checked ? "[x]" : "[ ]"} ${label}`);
}

// ── Showing ──

// `‹текст›`, the address on the next line; enter opens it. The address is
// written out because a terminal cannot be clicked on reliably over ssh.
export function Link(
  { text, href, onOpen, active = true }: { text: string; href: string; onOpen?: (href: string) => void; active?: boolean },
): ReactElement {
  useKeys((_input, key) => {
    if (active && key.return) onOpen?.(href);
  });
  return h(Stack, null, h(Item, { on: active }, `‹${text}›`), h(Muted, null, `  ${href}`));
}

// A block of three lines: title, what it is, the text. `on` — the list's focus
// is on it (the list moves with up and down).
export function Card(
  { title, meta, body, on = false }: { title: string; meta?: string; body?: string; on?: boolean },
): ReactElement {
  return h(
    Stack,
    null,
    h(Item, { on, bold: on }, title),
    meta ? h(Muted, null, `  ${meta}`) : null,
    body ? h(Txt, null, `  ${body}`) : null,
  );
}

// One message of a conversation: `имя  время`, and the text under it.
export function Line({ name, time, text }: { name: string; time?: string; text: string }): ReactElement {
  return h(Stack, null, h(Muted, null, time ? `${name}  ${time}` : name), h(Txt, null, text));
}

// A board as a grid of ASCII cells; a row given as one string is drawn as it
// is (the dots board comes already laid out). `at` — the cell the cursor stands
// on, shown by "> " on its row and inverse on the cell; arrows and enter belong
// to the screen that owns the board. Without `at` the rows are not indented.
export function Board(
  { rows, at }: { rows: Array<string | string[]>; at?: { row: number; col: number } },
): ReactElement {
  return h(
    Stack,
    null,
    ...rows.map((cells, r) =>
      typeof cells === "string"
        ? h(Txt, { key: r }, cells)
        : h(
          Row,
          { key: r },
          at ? h(Txt, null, at.row === r ? "> " : "  ") : null,
          ...cells.map((cell, c) =>
            h(Txt, { key: c, inverse: at !== undefined && at.row === r && at.col === c }, c === 0 ? cell : ` ${cell}`)
          ),
        )
    ),
  );
}
