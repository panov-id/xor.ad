// Where the person is: one copy for both faces, depth/core/place.ts (18.10.2026). The city list stays here,
// beside this file, and loads only when the picker opens (Vite splits it off).
import { type City, citiesFrom } from "../../../depth/core/place.ts";

export * from "../../../depth/core/place.ts";
citiesFrom(() => import("./cities.json").then((m) => (m.default as unknown as { cities: City[] }).cities));
