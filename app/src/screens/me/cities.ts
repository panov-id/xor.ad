// The place list for depth/core/place.ts: the web's own file (web/src/geo/cities.json, GeoNames cities15000,
// CC BY 4.0), read in place through the @cities alias (vite.config.ts), and the villages of villages-cy.json
// (GeoNames CY, CC BY 4.0, scripts/geo/build-villages.sh). Vite splits both off: they load only when the picker opens.
import { type City, citiesFrom } from "@sdk/place.ts";
import { mergePlaces } from "./place-map";

let list: Promise<City[]> | null = null;
export const allPlaces = (): Promise<City[]> => (list ??= Promise.all([import("@cities"), import("./villages-cy.json")])
  .then(([c, v]) => mergePlaces((c.default as unknown as { cities: City[] }).cities, (v.default as unknown as { cities: City[] }).cities)));

citiesFrom(allPlaces);
