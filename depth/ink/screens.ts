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

type Phrase = { id: string; text: string; name?: string; age?: number; distance_m?: number; minutes_ago?: number; liked?: boolean };

// 3 · the feed. Up and down walk the phrases, left and right the actions.
export function Feed(
  { say, client, place, mine, onWrite, onInbox, onPoint, onError }: {
    say: Say;
    client: Client;
    place: Place;
    mine?: { text: string; state: string };
    onWrite: () => void;
    onInbox: () => void;
    onPoint: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [items, setItems] = useState<Phrase[] | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    client.feed(place)
      .then((answer) => setItems(answer.items as Phrase[]))
      .catch((e: Error) => onError(e.message));
  }, [place.lat, place.lon, place.radius]);
  const chosen = items?.[at];
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
        { key: "like", label: chosen?.liked === true ? say("feed.unlike") : say("feed.like"), disabled: !chosen },
        { key: "write", label: say("feed.write") },
        { key: "inbox", label: say("feed.inbox") },
        { key: "point", label: say("feed.point") },
        { key: "exit", label: say("common.exit") },
      ],
      onPick: (key) => {
        if (key === "write") return onWrite();
        if (key === "inbox") return onInbox();
        if (key === "point") return onPoint();
        if (key === "exit") return process.exit(0);
        if (!chosen) return;
        const act = chosen.liked === true ? client.unlike(chosen.id) : client.like(chosen.id);
        act
          .then(() => setItems((list) => (list ?? []).map((p) => (p.id === chosen.id ? { ...p, liked: !p.liked } : p))))
          .catch((e: Error) => onError(e.message));
      },
      hint: say("common.rowActions"),
    }),
    h(Text, { dimColor: true }, `↑↓  ${say("feed.write")} · ${at + 1}/${items?.length ?? 0}`),
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
