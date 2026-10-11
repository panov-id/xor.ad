// Tables in the feed (chat spec §6.1): a table is seen by those whose viewing
// circle crosses its zone, by the rule a phrase is seen by. Without this a
// table had no way to be found but a link (finding of W8).
//
// Who sees which table, from §6.1:
// - the circles cross — measured from the *published* centre, rounded to the
//   table's step as a phrase's is (§8.3, lib/feed_geo.ts quantise), so the
//   boundary cannot be walked back to the exact point;
// - someone sits there — a table with nobody seated has no band and is not
//   shown at all;
// - "each with each": the viewer is inside the band of every one seated and
//   they inside the viewer's; a block either way with anyone seated hides it;
// - not the caller's own table, not one they liked (it lives in GET /likes);
// - a free place to play: a full table leaves the feed (the coordinator's
//   task G1h — the spec lets anybody sit, so "full" is the players, not the
//   company).
// A quarter of the page at most, chosen at random, not by the freshness of a
// move (§6.1: a table waiting for its first guest makes no moves).

import { query } from "./db.ts";
import { boundingBox, metresBetween, quantise } from "./feed_geo.ts";
import { bandBetween, blockedEither } from "./tables.ts";

export interface TableCard {
  kind: "table";
  id: string;
  game: string;
  set: string;
  seats: number;
  free_seats: number;
  playing: number;
  watching: number;
  name: string | null;
  like_count: number;
  lat: number;
  lon: number;
  area_radius: number;
}

interface TableRow {
  id: string; game: string; set: string; seats: number; name: string | null; like_count: number;
  lat: number; lon: number; area_radius: number; playing: number; watching: number;
  created_cursor: string;
}

// Who may see which table (the list above), as one query for the feed and for
// GET /tables alike, so the two cannot drift apart. $1 is the viewer, $2..$5
// the box; `extra` adds conditions after these, `tail` the order and the limit.
function visibleTables(extra: string, tail: string): string {
  return `SELECT t.id, t.game, t.set, t.seats, t.name, t.like_count, t.lat, t.lon, t.area_radius,
            count(*) FILTER (WHERE s.playing_from IS NOT NULL)::int AS playing,
            count(*) FILTER (WHERE s.playing_from IS NULL)::int AS watching,
            (extract(epoch from t.created_at) * 1000000)::bigint::text AS created_cursor
       FROM tables t
       JOIN table_seats s ON s.table_id = t.id AND s.left_at IS NULL
      WHERE t.closed_at IS NULL
        AND t.lat BETWEEN $2 AND $3 AND t.lon BETWEEN $4 AND $5
        AND NOT EXISTS (SELECT 1 FROM table_seats mine WHERE mine.table_id = t.id AND mine.identity = $1 AND mine.left_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM table_likes tl WHERE tl.table_id = t.id AND tl.identity = $1)
        AND NOT EXISTS (
          SELECT 1 FROM table_seats o JOIN identities other ON other.id = o.identity JOIN identities me ON me.id = $1
           WHERE o.table_id = t.id AND o.left_at IS NULL
             AND (NOT ${bandBetween("me", "other")} OR ${blockedEither("me.id", "other.id")}))
        ${extra}
      GROUP BY t.id
     HAVING count(*) FILTER (WHERE s.playing_from IS NOT NULL) < t.seats
      ${tail}`;
}

// The circles cross, from the published centre (§6.1, §8.3): null when not.
function cardOf(row: TableRow, at: { lat: number; lon: number }, radius: number): TableCard | null {
  const published = quantise({ lat: row.lat, lon: row.lon }, row.area_radius);
  if (metresBetween(published, at) > row.area_radius + radius) return null;
  return plainCard(row);
}

function plainCard(row: Omit<TableRow, "created_cursor">): TableCard {
  const published = quantise({ lat: row.lat, lon: row.lon }, row.area_radius);
  return {
    kind: "table",
    id: row.id,
    game: row.game,
    set: row.set,
    seats: row.seats,
    free_seats: row.seats - row.playing,
    playing: row.playing,
    watching: row.watching,
    name: row.name,
    like_count: row.like_count,
    lat: published.lat,
    lon: published.lon,
    area_radius: row.area_radius,
  };
}

export async function tablesForFeed(
  viewer: string,
  at: { lat: number; lon: number },
  radius: number,
  most: number,
): Promise<TableCard[]> {
  const box = boundingBox(at, radius + 10000);
  const rows = await query<TableRow>(
    visibleTables("", "ORDER BY random() LIMIT 200"),
    [viewer, box.latMin, box.latMax, box.lonMin, box.lonMax],
  );
  const cards: TableCard[] = [];
  for (const row of rows ?? []) {
    const card = cardOf(row, at, radius);
    if (!card) continue;
    cards.push(card);
    if (cards.length >= most) break;
  }
  return cards;
}

// GET /tables (П18, the owner's decision of 10.10.2026): every table the viewer
// may see, a page at a time, newest first. Before this the screen "Столы" took
// the tables of the feed's first page — a quarter of it at most, at random — so
// with a long feed some tables were never on it.
//
// The order is (created_at, id), a pair for the reason the feed's is
// (routes/feed.ts, DATA-5); the circle is measured here, after the query, so
// one read may keep fewer rows than it fetched — it reads on until the page is
// full or the rows end. The page's cursor is its last *shown* table: a row
// skipped after it is skipped again on the next page, never lost.
let SCAN = 100;
// A read stops after this many portions even if the page is not full: a circle
// that cuts away almost every row of a dense box would otherwise read the box
// whole (verifier of P18, 10.10.2026). The page then ends short, with a cursor
// from where the reading stopped, so the next page goes on from there.
let SCANS = 10;

// Only for tests: a cap small enough to reach without a thousand tables.
export function scanLimits(portion = 100, portions = 10): void {
  SCAN = portion;
  SCANS = portions;
}

export async function tablesPage(
  viewer: string,
  at: { lat: number; lon: number },
  radius: number,
  after: { micros: string; id: string } | null,
  size: number,
): Promise<{ cards: TableCard[]; last: { micros: string; id: string } | null; more: boolean } | null> {
  const box = boundingBox(at, radius + 10000);
  const cards: TableCard[] = [];
  const keys: { micros: string; id: string }[] = [];
  let scan = after;
  for (let portion = 0; ; portion++) {
    const rows = await query<TableRow>(
      visibleTables(
        `AND ($6::bigint IS NULL OR (t.created_at, t.id) <
               (timestamptz 'epoch' + $6::bigint * interval '1 microsecond', $7::uuid))`,
        `ORDER BY t.created_at DESC, t.id DESC LIMIT ${SCAN}`,
      ),
      [viewer, box.latMin, box.latMax, box.lonMin, box.lonMax, scan?.micros ?? null, scan?.id ?? null],
    );
    if (rows === null) return null;
    for (const row of rows) {
      const card = cardOf(row, at, radius);
      if (!card) continue;
      // One more than the page, to know whether there is a next one.
      if (cards.length === size) return { cards, last: keys[size - 1], more: true };
      cards.push(card);
      keys.push({ micros: row.created_cursor, id: row.id });
    }
    if (rows.length < SCAN) break;
    const end = rows[rows.length - 1];
    scan = { micros: end.created_cursor, id: end.id };
    if (portion + 1 >= SCANS) return { cards, last: scan, more: true };
  }
  return { cards, last: keys[keys.length - 1] ?? null, more: false };
}

// Tables among the cards: one after every third phrase, the rest at the end.
// Phrases are counted, not cards, and an offer stays right behind the phrase
// it follows (routes/feed.ts puts it there): a table due after that phrase
// goes after the offer instead.
export function interleave<T>(cards: T[], tables: TableCard[]): (T | TableCard)[] {
  const kindOf = (card: unknown) => (card as { kind?: string } | undefined)?.kind;
  const out: (T | TableCard)[] = [];
  let t = 0;
  let phrases = 0;
  let due = false;
  cards.forEach((card, i) => {
    out.push(card);
    if (kindOf(card) === "phrase" && ++phrases % 3 === 0) due = true;
    if (due && kindOf(cards[i + 1]) !== "offer" && t < tables.length) {
      out.push(tables[t++]);
      due = false;
    }
  });
  while (t < tables.length) out.push(tables[t++]);
  return out;
}

// The caller's own tables for the screen «Столы» (П18b): where they sit and
// what they liked — the two the list above leaves out, because the feed shows
// neither (one's own is one's own, a liked one is kept by the like). Wherever
// they stand, full or not; open ones only. A table both sat at and liked is
// one card with both marks.
export interface MyTableCard extends TableCard {
  seated: boolean;
  liked: boolean;
}

export async function myTables(viewer: string): Promise<MyTableCard[] | null> {
  const rows = await query<Omit<TableRow, "created_cursor"> & { seated: boolean; liked: boolean }>(
    `SELECT t.id, t.game, t.set, t.seats, t.name, t.like_count, t.lat, t.lon, t.area_radius,
            (SELECT count(*) FROM table_seats s WHERE s.table_id = t.id AND s.left_at IS NULL AND s.playing_from IS NOT NULL)::int AS playing,
            (SELECT count(*) FROM table_seats s WHERE s.table_id = t.id AND s.left_at IS NULL AND s.playing_from IS NULL)::int AS watching,
            EXISTS (SELECT 1 FROM table_seats m WHERE m.table_id = t.id AND m.identity = $1 AND m.left_at IS NULL) AS seated,
            EXISTS (SELECT 1 FROM table_likes l WHERE l.table_id = t.id AND l.identity = $1) AS liked
       FROM tables t
      WHERE t.closed_at IS NULL
        AND (EXISTS (SELECT 1 FROM table_seats m WHERE m.table_id = t.id AND m.identity = $1 AND m.left_at IS NULL)
          OR EXISTS (SELECT 1 FROM table_likes l WHERE l.table_id = t.id AND l.identity = $1))
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 50`,
    [viewer],
  );
  if (rows === null) return null;
  return rows.map((row) => ({ ...plainCard(row), seated: row.seated, liked: row.liked }));
}
