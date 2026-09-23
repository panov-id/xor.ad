// The screens themselves, in the order a person meets them: registration,
// the location, the feed, writing a phrase, the inbox, a chat.
//
// The rule of §13: this layer only calls the core (depth/core/client.ts). It
// never signs, seals or opens anything by itself — if a screen needs a key, it
// is asking the wrong question.

import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { Client, Radius } from "../core/client.ts";
import type { Say } from "./strings.ts";
import { Form, Head, Menu, plain } from "./parts.ts";

export const RADII: Radius[] = [100, 300, 1000, 3000, 10000];

export type Place = { lat: number; lon: number; radius: Radius };

// 1 · registration. The PIN and the paper code are still the core's testOnly
// stubs, so the screen says so rather than pretending.
export function Registration(
  { say, onDone, error }: { say: Say; onDone: (name: string, age: number) => void; error?: string },
): ReactElement {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const ready = name.trim().length > 0 && /^\d{2,3}$/.test(age) && Number(age) >= 18;
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("reg.title"), lines: [say("reg.intro")] }),
    h(Form, {
      fields: [
        { key: "name", label: say("reg.name"), value: name },
        { key: "age", label: say("reg.age"), value: age },
      ],
      onChange: (key, value) => (key === "name" ? setName(value) : setAge(value.replace(/\D/g, ""))),
      actions: [{ key: "go", label: say("reg.next"), disabled: !ready }, { key: "exit", label: say("common.exit") }],
      onPick: (key) => (key === "go" ? onDone(name.trim(), Number(age)) : process.exit(0)),
      fieldsHint: say("common.rowFields"),
      actionsHint: say("common.rowActions"),
    }),
    error ? h(Text, { color: "red" }, error) : null,
    h(Text, { dimColor: true }, `# ${say("reg.stub")}`),
  );
}

// 2 · the location. It is the feed's filter and the phrase's origin, it is
// asked at every start, and it is never written to disk (the owner, 2026-09-22).
export function Location(
  { say, place, onDone }: { say: Say; place?: Place; onDone: (place: Place) => void },
): ReactElement {
  const [lat, setLat] = useState(place ? String(place.lat) : "");
  const [lon, setLon] = useState(place ? String(place.lon) : "");
  const [radius, setRadius] = useState<Radius>(place?.radius ?? 1000);
  const numbers = { lat: Number(lat), lon: Number(lon) };
  const ok = lat !== "" && lon !== "" && Math.abs(numbers.lat) <= 90 && Math.abs(numbers.lon) <= 180 &&
    !Number.isNaN(numbers.lat) && !Number.isNaN(numbers.lon);
  const clean = (value: string) => value.replace(/[^\d.\-]/g, "");
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("loc.title"), lines: [say("loc.intro1"), say("loc.intro2")] }),
    ok ? null : h(Text, { dimColor: true }, say("loc.bad")),
    h(Form, {
      fields: [
        { key: "lat", label: say("loc.lat"), value: lat },
        { key: "lon", label: say("loc.lon"), value: lon },
        { key: "radius", label: say("loc.radius"), value: String(radius), choices: RADII.map(String) },
      ],
      onChange: (key, value) => {
        if (key === "lat") setLat(clean(value));
        else if (key === "lon") setLon(clean(value));
        else setRadius(Number(value) as Radius);
      },
      actions: [{ key: "go", label: say("loc.go"), disabled: !ok }, { key: "exit", label: say("common.exit") }],
      onPick: (key) => (key === "go" ? onDone({ ...numbers, radius }) : process.exit(0)),
      fieldsHint: say("common.rowFields"),
      actionsHint: say("common.rowActions"),
    }),
  );
}

type Phrase = {
  id: string; text: string; name?: string; age?: number; distance_m?: number; minutes_ago?: number; liked?: boolean;
  like_count?: number; soon?: boolean; offer?: unknown;
};

// 3 · the feed. Up and down walk the phrases, left and right the actions.
export function Feed(
  { say, client, place, mine, onWrite, onInbox, onPoint, onMe, onError }: {
    say: Say;
    client: Client;
    place: Place;
    mine?: { text: string; state: string };
    onWrite: () => void;
    onInbox: () => void;
    onPoint: () => void;
    // "Me" holds what used to crowd this row: restrictions, liked, hidden,
    // blocked (§4.11; the row outgrew a hundred columns on 23.09.2026).
    onMe?: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [items, setItems] = useState<Phrase[] | null>(null);
  const [at, setAt] = useState(0);
  const [blocking, setBlocking] = useState(false);
  const [card, setCard] = useState(false);
  useEffect(() => {
    client.feed(place)
      .then((answer) => setItems(answer.items as Phrase[]))
      .catch((e: Error) => onError(e.message));
  }, [place.lat, place.lon, place.radius]);
  const chosen = items?.[at];
  const drop = (id: string) => setItems((list) => (list ?? []).filter((p) => p.id !== id));
  if (card && items && items.length > 0) {
    return h(Card, {
      say,
      items,
      at: Math.min(at, items.length - 1),
      onMove: setAt,
      onLike: (p) =>
        client.like(p.id)
          .then((answer) => {
            if (answer.status !== 200) throw new Error(`the like refused: ${answer.status}`);
            drop(p.id);
          })
          .catch((e: Error) => onError(e.message)),
      onHide: (p) =>
        client.hide(p.id)
          .then(() => drop(p.id))
          .catch((e: Error) => onError(e.message)),
      onClose: () => setCard(false),
    });
  }
  const line = (p: Phrase, i: number) =>
    h(
      Box,
      { key: p.id, flexDirection: "column" },
      h(
        Text,
        { bold: i === at },
        `${i === at ? "›" : " "} ${plain(p.name ?? "?", 48)}, ${plain(p.age ?? "?", 3)} · `,
        say("feed.distance", { meters: p.distance_m ?? 0 }),
        " · ",
        say("feed.minutes", { minutes: p.minutes_ago ?? 0 }),
      ),
      h(Text, null, `  ${plain(p.text, 200)}`),
    );
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, {
      title: say("feed.header", { lat: place.lat, lon: place.lon, radius: place.radius, from: 18, to: 99 }),
    }),
    items === null
      ? h(Text, { dimColor: true }, "…")
      : items.length === 0
      ? h(Text, { dimColor: true }, say("feed.empty"))
      : h(Box, { flexDirection: "column", gap: 1 }, ...items.map(line)),
    h(
      Text,
      { dimColor: true },
      mine ? `${say("feed.yours", { text: plain(mine.text, 200) })} · ${mine.state === "pending" ? say("feed.checking") : mine.state}` : say("feed.none"),
    ),
    h(Menu, {
      actions: [
        { key: "open", label: say("inbox.enter"), disabled: !chosen },
        { key: "like", label: say("feed.like"), disabled: !chosen },
        { key: "hide", label: say("feed.hide"), disabled: !chosen },
        { key: "block", label: say("block.item"), disabled: !chosen },
        { key: "write", label: say("feed.write") },
        { key: "inbox", label: say("feed.inbox") },
        { key: "point", label: say("feed.point") },
        { key: "me", label: say("me.title") },
        { key: "exit", label: say("common.exit") },
      ],
      onPick: (key) => {
        if (key === "write") return onWrite();
        if (key === "inbox") return onInbox();
        if (key === "point") return onPoint();
        if (key === "me") return onMe?.();
        if (key === "open") return chosen && setCard(true);
        if (key === "exit") return process.exit(0);
        if (!chosen) return;
        // Hiding is mine alone and can be taken back (§8.9); blocking ends the
        // conversation for both and cannot be set again once lifted (§4.8) —
        // so the second one asks twice, in the row itself.
        if (key === "hide") {
          return void client.hide(chosen.id)
            .then(() => setItems((list) => (list ?? []).filter((p) => p.id !== chosen.id)))
            .catch((e: Error) => onError(e.message));
        }
        if (key === "block") {
          if (!blocking) return setBlocking(true);
          setBlocking(false);
          return void client.blockByPhrase(chosen.id)
            .then(() => setItems((list) => (list ?? []).filter((p) => p.id !== chosen.id)))
            .catch((e: Error) => onError(e.message));
        }
        // What I liked is not in my feed (§4.10): the card leaves at once, and
        // "liked" in the menu is where it can be taken back.
        client.like(chosen.id)
          .then((answer) => {
            if (answer.status !== 200) throw new Error(`the like refused: ${answer.status}`);
            setItems((list) => (list ?? []).filter((p) => p.id !== chosen.id));
          })
          .catch((e: Error) => onError(e.message));
      },
      hint: say("common.rowActions"),
    }),
    blocking
      ? h(Text, { color: "red" }, `${say("block.confirm")} ${say("block.what")}`)
      : h(Text, { dimColor: true }, `↑↓ · ${at + 1}/${items?.length ?? 0}`),
    h(FeedKeys, { count: items?.length ?? 0, onMove: setAt }),
  );
}

// The feed's own arrows, kept apart so the menu's left and right do not fight
// the list's up and down.
function FeedKeys({ count, onMove }: { count: number; onMove: (fn: (at: number) => number) => void }): ReactElement {
  useInput((_input, key) => {
    if (count === 0) return;
    if (key.upArrow) onMove((at) => (at - 1 + count) % count);
    if (key.downArrow) onMove((at) => (at + 1) % count);
  });
  return h(Box, null);
}

// 4.4.1 · one card on the whole screen (storefront screen 23). → likes, ← hides,
// ↑↓ go through the feed, enter goes back — the mockup's letters are arrows and
// enter here, the owner's shape of 2026-09-22. The first → or ← does nothing but
// explain; that it was explained lives in this process only: the terminal
// keeps no volume (§6, 22.09.2026), so a new run explains once more.
// Someone else's remaining time is a word in the last 65 minutes, never a
// number — the node sends a flag, not a time (§8.11; owner, 23.09.2026).
let explained = false;

export function Card(
  { say, items, at, onMove, onLike, onHide, onClose }: {
    say: Say;
    items: Phrase[];
    at: number;
    onMove: (fn: (i: number) => number) => void;
    onLike: (p: Phrase) => void;
    onHide: (p: Phrase) => void;
    onClose: () => void;
  },
): ReactElement {
  const [hint, setHint] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const p = items[at];
  useInput((_input, key) => {
    if (key.return) {
      if (hint) {
        explained = true;
        return setHint(false);
      }
      return onClose();
    }
    if (key.upArrow || key.downArrow) {
      setNote(null);
      return onMove((i) => (key.downArrow ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1)));
    }
    if (key.leftArrow || key.rightArrow) {
      if (!explained) return setHint(true);
      if (!p) return;
      if (key.leftArrow) {
        setNote(say("card.hidden"));
        return onHide(p);
      }
      // An offer's like makes an offer to talk at once and cannot be taken
      // back, so → only goes on past it (§4.4.1).
      if (p.offer !== undefined) return onMove((i) => Math.min(items.length - 1, i + 1));
      setNote(null);
      onLike(p);
    }
  });
  const rule = "─".repeat(56);
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, { dimColor: true }, rule),
    p ? h(Text, null, `   ${plain(p.text, 400)}`) : h(Text, { dimColor: true }, "…"),
    p
      ? h(Text, { dimColor: true }, `   + ${Number(p.like_count) || 0}${p.soon === true ? ` · ${say("card.soon")}` : ""}`)
      : null,
    h(Text, { dimColor: true }, rule),
    hint ? h(Text, { color: "yellow" }, say("card.hint")) : null,
    note ? h(Text, { dimColor: true }, note) : null,
    h(Text, { dimColor: true }, `${say("card.keys")} · ${at + 1}/${items.length}`),
  );
}
