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

export async function tablesForFeed(
  viewer: string,
  at: { lat: number; lon: number },
  radius: number,
  most: number,
): Promise<TableCard[]> {
  const box = boundingBox(at, radius + 10000);
  const rows = await query<{
    id: string; game: string; set: string; seats: number; name: string | null; like_count: number;
    lat: number; lon: number; area_radius: number; playing: number; watching: number;
  }>(
    `SELECT t.id, t.game, t.set, t.seats, t.name, t.like_count, t.lat, t.lon, t.area_radius,
            count(*) FILTER (WHERE s.playing_from IS NOT NULL)::int AS playing,
            count(*) FILTER (WHERE s.playing_from IS NULL)::int AS watching
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
      GROUP BY t.id
     HAVING count(*) FILTER (WHERE s.playing_from IS NOT NULL) < t.seats
      ORDER BY random()
      LIMIT 200`,
    [viewer, box.latMin, box.latMax, box.lonMin, box.lonMax],
  );
  const cards: TableCard[] = [];
  for (const row of rows ?? []) {
    const published = quantise({ lat: row.lat, lon: row.lon }, row.area_radius);
    if (metresBetween(published, at) > row.area_radius + radius) continue;
    cards.push({
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
    });
    if (cards.length >= most) break;
  }
  return cards;
}

// Tables among the cards: one after every third phrase, the rest at the end.
// Phrases are counted, not cards, and an offer stays right behind the phrase
// it follows (routes/feed.ts puts it there): a table due after that phrase
// goes after the offer instead.
export function interleave<T>(cards: T[], tables: TableCard[]): (T | TableCard)[] {
  const kindOf = (card: unknown) => (card as { kind?: string }).kind;
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
