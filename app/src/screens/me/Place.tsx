// w4_place: a city typed (the offline list, depth/core/place.ts searchCities — nothing leaves the device to name a
// place), the first two found as rows with their country; or a point pasted from a map (Enter takes it, named by
// the nearest city); and the way to the place's QR. A choice is kept where the web keeps it ("place.v1",
// storePlace), so the feed of either face looks there. Testids (the web's): place-search, place-city, place-point,
// place-qr, error.
import { type FormEvent, useEffect, useState } from "react";
import { nameOf, parsePoint, type Place as PlaceT, searchCities, storePlace } from "@sdk/place.ts";
import { LANG, say } from "../../i18n";
import { Field } from "../register-parts";
import { pin, qr } from "./icons";
import { countryName } from "./me-logic";
import { ErrorLine, Row, SubPage } from "./parts";
import "./cities";

/** How many cities the list shows (the sheet draws two). */
export const SHOWN = 2;

export function Place({ onChosen, onBack, onQr }: { onChosen: (p: PlaceT) => void; onBack: () => void; onQr: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PlaceT[]>([]);
  const [point, setPoint] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void searchCities(q, SHOWN).then((list) => { if (live) setFound(list); }).catch(() => { if (live) setFound([]); });
    return () => { live = false; };
  }, [q]);
  const choose = (p: PlaceT) => { storePlace(p); onChosen(p); };
  async function fromPoint(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const at = parsePoint(point);
    if (!at) return setError(say("web.place.badPoint"));
    const n = await nameOf(at.lat, at.lon);
    choose({ ...at, name: n.name, cc: n.cc, source: "point" });
  }
  return (
    <SubPage name="place" title={say("app.place.title")} onBack={onBack}>
      <Field text={say("app.place.city")} value={q} onChange={setQ} testid="place-search" autoComplete="off" />
      {found.length > 0 && (
        <ul className="me-list" data-testid="place-found">
          {found.map((p) => (
            <li key={`${p.name}-${p.cc}-${p.lat}`}>
              <Row icon={pin} text={p.name} value={countryName(LANG, p.cc)} onOpen={() => choose(p)} testid="place-city" />
            </li>
          ))}
        </ul>
      )}
      <form className="me-point" onSubmit={(e) => void fromPoint(e)}>
        <Field text={say("app.place.point")} value={point} onChange={setPoint} testid="place-point" autoComplete="off" />
      </form>
      <ErrorLine text={error} />
      <Row icon={qr} text={say("app.place.qr")} onOpen={onQr} testid="place-qr" />
    </SubPage>
  );
}
