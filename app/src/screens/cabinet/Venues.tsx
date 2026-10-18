// w4_cabinet-venues: the venues as cards, each proved by the code from an envelope mailed to its address; the
// card of an unproved venue holds the code's cells, Confirm the code under it, then "Add a venue" (and the way to
// the offers). The web's cabinet (web/src/adv/Cabinet.tsx Venues, VenueRow) through the same calls, which live in
// depth/core/cabinet.ts together with the code's and the point's readings. Not drawn yet, so not here: moving a
// venue's point, "this isn't us" (the code from an envelope nobody ordered).
import { type ReactNode, useEffect, useId, useState } from "react";
import { addVenue, bareCode, CODE_LENGTH, codeReady, orderEnvelope, placeFrom, RADII, refusalMessage, type Refusal, type Venue, venues, venueState, venueStep, verify } from "@sdk/cabinet.ts";
import { say, sayCount } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { check, tag } from "../../shell/icons";
import { Cells, Field } from "../register-parts";
import { ErrorLine, Row } from "../me/parts";
import { mail, plus } from "./icons";
import { Frame } from "./parts";

const notTaken = (status: number) => say("web.cabinet.notTaken", { status });

/** "12 Leselidze St · 300 m circle": the address and the circle offers are shown in, or what is missing. */
export const venueLine = (v: Pick<Venue, "address" | "place">): string =>
  `${v.address} · ${v.place ? say("app.cabinet.circle", { m: v.place.area_radius }) : say("app.cabinet.no_point")}`;

function VenueCard({ venue, onChanged }: { venue: Venue; onChanged: () => void }) {
  const id = useId();
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const step = venueStep(venue);
  const state = venueState(venue.verification_status);
  async function order() {
    setBusy(true);
    setWrong(null);
    try {
      const answer = await orderEnvelope(venue.id);
      if (answer.status !== 202) return setWrong(refusalMessage(answer) ?? notTaken(answer.status));
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!codeReady(code) || busy) return;
    setBusy(true);
    setWrong(null);
    try {
      const answer = await verify(venue.id, bareCode(code));
      if (answer.status === 200) return onChanged();
      const refusal = answer.body as Refusal | null;
      if (answer.status === 422) {
        setWrong(`${say("app.cabinet.code_wrong")} ${sayCount("app.cabinet.tries", refusal?.error?.attempts_left ?? 0)}`);
        return onChanged();
      }
      if (answer.status === 409) {
        setWrong(say("web.cabinet.codeSpent"));
        return onChanged();
      }
      setWrong(refusalMessage(answer) ?? notTaken(answer.status));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cb-venue" data-testid="venue" data-status={state}>
      <div className="cb-card">
        <div className="cb-card-top">
          <h2 data-testid="venue-name">{venue.name}</h2>
          <span className="cb-chip" data-state={state} data-testid="venue-status">{say(`app.cabinet.status.${state}`)}</span>
        </div>
        <p className="cb-card-line" data-testid="venue-line">{venueLine(venue)}</p>
        {step === "code" && (
          <div className="cb-code">
            <label htmlFor={id}>{say("app.cabinet.code_label")}</label>
            <Cells id={id} text={say("app.cabinet.code_label")} value={code} size={CODE_LENGTH} onChange={(v) => setCode(bareCode(v))} testid="venue-code" invalid={wrong !== null} />
          </div>
        )}
      </div>
      {step === "code" && (
        <button type="button" className="cb-btn" aria-disabled={codeReady(code) && !busy ? undefined : true} onClick={() => void confirm()} data-testid="venue-verify">
          <Icon d={check} /><span>{say("app.cabinet.confirm")}</span>
        </button>
      )}
      {step === "order" && (
        <button type="button" className="cb-btn" aria-disabled={busy || undefined} onClick={() => void order()} data-testid="venue-envelope">
          <Icon d={mail} /><span>{say("app.cabinet.order")}</span>
        </button>
      )}
      <ErrorLine text={wrong} />
    </section>
  );
}

export function Venues({ strip, onAdd, onOffers }: { strip: ReactNode; onAdd: () => void; onOffers: () => void }) {
  const [rows, setRows] = useState<Venue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => venues().then((a) => (a.status === 200 ? setRows(a.body!.items) : setError(notTaken(a.status)))).catch(() => setError(notTaken(0)));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Frame name="cabinet-venues" title={say("app.cabinet.venues_title")} strip={strip}>
      {rows?.map((v) => <VenueCard key={v.id} venue={v} onChanged={() => void load()} />)}
      <ErrorLine text={error} />
      <Row icon={plus} text={say("app.cabinet.add_venue")} onOpen={onAdd} testid="venue-add-open" />
      <Row icon={tag} text={say("app.cabinet.my_offers")} onOpen={onOffers} testid="offers-open" />
    </Frame>
  );
}

/** The form for a new venue: its name and address, and the point offers are shown around (without it the node refuses to publish). */
export function AddVenue({ strip, onDone }: { strip: ReactNode; onDone: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [point, setPoint] = useState("");
  const [radius, setRadius] = useState(1000);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = name.trim() !== "" && address.trim() !== "" && !busy;
  async function go() {
    if (!ready) return;
    const at = placeFrom(point, radius);
    if (at === "bad") return setRefused(say("web.cabinet.pointNumbers"));
    setBusy(true);
    setRefused(null);
    try {
      const made = await addVenue(name.trim(), address.trim(), at ?? undefined);
      if (made.status !== 201) return setRefused(refusalMessage(made) ?? notTaken(made.status));
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame name="cabinet-add-venue" title={say("app.cabinet.add_venue")} strip={strip}
      foot={<button type="button" className="cta cta-primary" aria-disabled={ready ? undefined : true} aria-busy={busy || undefined} onClick={() => void go()} data-testid="venue-add"><Icon d={plus} /><span>{say("app.cabinet.add")}</span></button>}>
      <Field text={say("app.cabinet.name")} value={name} onChange={setName} testid="venue-name-input" autoComplete="off" />
      <Field text={say("app.cabinet.address")} value={address} onChange={setAddress} testid="venue-address" autoComplete="street-address" />
      <Field text={say("app.cabinet.point")} value={point} onChange={setPoint} testid="venue-point" autoComplete="off" />
      <div className="me-chips" role="radiogroup" aria-label={say("app.cabinet.radius")}>
        {RADII.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={r === radius} className="me-chip" onClick={() => setRadius(r)} data-testid={`venue-radius-${r}`}>{say("app.cabinet.metres", { m: r })}</button>
        ))}
      </div>
      <p className="cb-hint">{say("web.cabinet.unverifiedNote")}</p>
      <ErrorLine text={refused} />
    </Frame>
  );
}
