# Wizard place step — patch for web/src/App.tsx

Not applied: App.tsx is being reworked in another tree. Apply there.
Wizard.tsx already has the place step (step 5) and the `onPlace` prop; the locale key
`web.place.none` exists in all 17 dictionaries.

Goal: no silent Rome. A newcomer who skips the wizard sees «место не выбрано» on the feed;
a place chosen in the wizard reaches the feed at once (App's `at` is read from storage only
at mount, before registration, so without `onPlace` the feed would stay on the fallback).

```diff
@@ imports
-import { FALLBACK, type Place as PlaceT, storedPlace } from "./geo/place.ts";
+import { FALLBACK, type Place as PlaceT, storedPlace } from "./geo/place.ts";
+import { say } from "./locales/say.ts"; // if not imported already
@@ Face()
-  const [at, setAt] = useState<PlaceT>(() => storedPlace() ?? FALLBACK);
+  const [at, setAt] = useState<PlaceT>(() => storedPlace() ?? FALLBACK);
+  // Nobody said where they are: the feed says so instead of pretending to be in Rome (GOALS §0).
+  // FALLBACK still gives the node a point to read around until a place is chosen.
+  const [placeChosen, setPlaceChosen] = useState(() => storedPlace() !== null);
+  const choosePlace = (p: PlaceT) => { setAt(p); setPlaceChosen(true); };
@@ case "feed": <FeedView
-            at={at}
+            at={placeChosen ? at : { lat: at.lat, lon: at.lon, name: say("web.place.none") }}
@@ case "place":
-      return <Place current={at} onChosen={(p) => { setAt(p); toFeed(); }} onBack={toFeed} />;
+      return <Place current={at} onChosen={(p) => { choosePlace(p); toFeed(); }} onBack={toFeed} />;
@@ case "wizard":
-      return <Wizard onDone={() => { markWizardSeen(); if (screen.from === "me") me(); else void land(seated!.client); }} />;
+      return <Wizard onPlace={choosePlace} onDone={() => { markWizardSeen(); if (screen.from === "me") me(); else void land(seated!.client); }} />;
```

Effect on the feed header (screens/Feed.tsx, unchanged): `HeaderFeed place=` shows
«место не выбрано», and the PlaceBar label reads «место: место не выбрано» — tolerable;
if not, Feed could pass `say("web.place.none")` alone when the name equals it (Feed is not
in this patch's scope).

Note: Place.tsx shows `current.name` (here "Rome") as «now» when nothing is chosen; that file
belongs to another worker — they may want `current: PlaceT | null`.

e2e: `web/e2e/specs/wizard.spec.ts` asserts «no place chosen» on the feed after a skip and
«Limassol» on the feed after the wizard — both go red until this patch is applied.
