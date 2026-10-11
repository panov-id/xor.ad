// Where you are (owner 11.10.2026): «where am I» from the browser, a city found by its name in any script
// (geo/place.ts: an offline list, transliterated), or a point pasted from a map. Chosen, it is kept on this
// device and the feed reads around it. Nothing is sent anywhere to name the place.

import { useEffect, useState } from "react";
import { say } from "../locales/say.ts";
import { here, nameOf, parsePoint, type Place as PlaceT, searchCities, storePlace } from "../geo/place.ts";
import { Button } from "../ui/Button.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { Field } from "../ui/Field.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Split } from "../ui/Split.tsx";

export function Place({ current, onChosen, onBack }: { current: PlaceT; onChosen: (p: PlaceT) => void; onBack: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PlaceT[]>([]);
  const [point, setPoint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void searchCities(q).then((list) => { if (live) setFound(list); });
    return () => { live = false; };
  }, [q]);

  const choose = (p: PlaceT) => { storePlace(p); onChosen(p); };
  async function fromBrowser() {
    setError(null); setBusy(true);
    const at = await here();
    setBusy(false);
    if (!at) return setError(say("web.place.denied"));
    const n = await nameOf(at.lat, at.lon);
    choose({ lat: Math.round(at.lat * 1000) / 1000, lon: Math.round(at.lon * 1000) / 1000, name: n.name, cc: n.cc, source: "geo" });
  }
  async function fromPoint() {
    setError(null);
    const at = parsePoint(point);
    if (!at) return setError(say("web.place.badPoint"));
    const n = await nameOf(at.lat, at.lon);
    choose({ ...at, name: n.name, cc: n.cc, source: "point" });
  }

  return (
    <Screen name="place" title={say("web.place.title")} header={<HeaderScreen title={say("web.place.title")} onBack={onBack} backLabel={say("common.back")} />}>
      <p className="ui-hint" data-testid="place-now">{current.name}</p>
      <Button type="button" kind="primary" icon="pin" className="ui-wide" aria-label={say("web.place.here")} disabled={busy} onClick={() => void fromBrowser()} data-testid="place-here" />
      <Field label={say("web.place.search")} value={q} onChange={setQ} autoComplete="off" data-testid="place-search" />
      {found.length > 0 && (
        <ul className="ui-cards" data-testid="place-found">
          {found.map((p) => (
            <li key={`${p.name}-${p.cc}-${p.lat}`}>
              <Button type="button" aria-label={`${p.name}, ${p.cc}`} onClick={() => choose(p)} data-testid="place-city">{p.name} · {p.cc}</Button>
            </li>
          ))}
        </ul>
      )}
      <Field label={say("web.place.point")} value={point} onChange={setPoint} autoComplete="off" data-testid="place-point" />
      <Split><Button type="button" icon="check" aria-label={say("web.place.use")} onClick={() => void fromPoint()} data-testid="place-use" /></Split>
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
    </Screen>
  );
}
