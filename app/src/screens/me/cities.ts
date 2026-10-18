// The city list for depth/core/place.ts: the web's own file (web/src/geo/cities.json, GeoNames cities15000,
// CC BY 4.0), read in place through the @cities alias (vite.config.ts) and split off by Vite — it loads only
// when the place picker searches.
import { type City, citiesFrom } from "@sdk/place.ts";

citiesFrom(() => import("@cities").then((m) => (m.default as unknown as { cities: City[] }).cities));
