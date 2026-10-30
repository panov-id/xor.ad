# Place map layer (sosed): designer brief

Pair: [MAP_LAYER_BRIEF_RU.md](MAP_LAYER_BRIEF_RU.md). Written 29.10.2026 from the code of `app/src/screens/me/Place.tsx` and `app/src/screens/me/place-map.ts`.

## 1. Where it is

Me → Place → the tile with the city name (`Place.tsx:242`) opens the map. It is a screen of its own, not the feed's background: here a person picks where they are and how far they see the feed.

The archives `docs/newdesign/` and `docs/newdesign3/` have no map sheet: `proto/place.html` draws only the tiles Here, QR and coordinates. Today the map is built by code from the sketch `docs/newsdesign/place-flow.svg`.

## 2. Principle

Our own map, no Google, no OSM. No streets, buildings or satellite, now or later. It is a scheme: land, sea, cities, circle.

## 3. Layers bottom to top

`Place.tsx:98-110`:

1. **Sea** — the background of the whole layer, a flat fill.
2. **Land** — a fill with the coast outline, lakes cut out (`fill-rule: evenodd`). Natural Earth draws the coast of Cyprus in runs of about 3 km, so land shows only at radii 3 and 10 km; at 100 m, 300 m and 1 km there is none (`place-map.ts:13`, `LAND_FROM = 3000`).
3. **Cities** — a dot of radius 3 px and a label, at most 6, biggest first (`place-map.ts:15`, `LABELS = 6`). Label right of the dot, left of it near the right edge.
4. **Radius circle** — how far the feed reaches. Room around it: half the screen's short side equals 1.6 radii (`place-map.ts:11`, `VIEW = 1.6`).
5. **Marker** — a 14 px radius disc in the centre. It stays still; the map moves under it.

## 4. Below the map

- the hint "drag the map";
- the radius slider, 5 steps: 100 m, 300 m, 1 km, 3 km, 10 km, step labels under it;
- a line like "Near Limassol, 1 km";
- the Here button.

Coordinates never appear on screen.

## 5. Gestures

Drag with a finger; pinch moves the radius to the nearest step; the mouse wheel does the same. No map library; the gestures are our code.

## 6. States to draw

1. Radius 100 m–1 km: cities and circle only, no land. This is the normal look.
2. Radius 3–10 km: land and coast.
3. Over the sea, no land in view.
4. No city nearby: no labels.
5. Land data failed to load: city dots and circle on a flat background.
6. 4 themes and auto; widths 390, 834, 1440, 1920.
7. The feed is empty in the chosen radius: the node widens it up to 25 km on its own (`relay/node/src/routes/feed.ts:452-528`). If the owner decides to show this, a mark "showing within N km" is needed.

## 7. What we expect

A `place-map` sheet in the `proto/` style at every width: land, sea, circle and marker colours as theme tokens; font and size of city labels; the slider's look; where the map goes on wide screens.

## 8. Constraints

- Marker and circle always in the centre.
- No land layer at 100 m–1 km.
- Others never see the exact point: the centre snaps to a grid with a step equal to the radius (`relay/node/src/lib/feed_geo.ts:28-36`).

## 9. What was checked

By code: the layers and their order, `LAND_FROM`, `VIEW`, `LABELS`. By search: the archives `docs/newdesign/`, `docs/newdesign3/` have no map sheet.

On the stand 29.10.2026, Limassol, 390 and 1440, the default theme: at 1 km 0 land outlines and 1 city, at 10 km 2 land outlines and 3 cities.

## 10. What the shots show today

1. Land and sea are nearly the same colour: the coast is hard to read. Contrast is needed, as theme tokens.
2. At 1 km the map is an empty background with the circle and one label: the designer decides how this view does not look empty.
3. City labels run into the marker and the circle (Kato Polemidia next to the marker at 10 km).
4. At 1440 the map stands in the right panel, a narrow column, with Me on the left.

