// w4_me (sosed Dusk, mobile): the name card, the settings as rows, the tab bar; what each row opens is its own
// screen in this folder (w4_me-edit-name, w4_me-pin, w4_me-reset, w4_place, w4_place-qr, w4_theme, w4_legal,
// w4_statements, w4_step-away, w4_age-filter). The web's Me (web screens/Me.tsx) through the same SDK calls:
// client.profile, statements; the rows' testids are the web's (me-name, me-theme, me-lang, me-filter, me-pin,
// me-reissue, me-move, me-away, me-legal, me-reset, me-statements) plus me-place, me-hidden, me-blocked.
//
// The rows of the sheets: w4_me (390) draws seven; tablet_834_Me adds «Hidden phrases», «Blocked» (with their counts), «Documents»
// and the step-away's choices on its row — the choices only from the tablet up (the phone's sheet has none). The place row and the
// statements row (only while the node holds one) are this shell's, no sheet draws them.
// Not here yet (rows drawn, opening a titled stand-in): the move (w4_wizard-*).
// Stepping away hands the moment it ends to onAway: the shell opens its own away screen (screens/Away.tsx, w2_away).
import { useEffect, useState, type ReactElement } from "react";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, say } from "../../i18n";
import { storedPlace } from "../../place";
import { NdIcon } from "../../shell/NdIcon";
import { useMinWidth } from "../../shell/useMinWidth";
import { Screen } from "../../shell/Screen";
import { TabBar, type Tab } from "../../shell/TabBar";
import { AgeFilter } from "./AgeFilter";
import { Blocked } from "./Blocked";
import { ChangePin } from "./ChangePin";
import { EditAge } from "./EditAge";
import { EditName } from "./EditName";
import { Departure, DepartureDone } from "../Departure";
import { Hidden } from "./Hidden";
import { awayValue, HubPage, hubSub, hubTitle } from "./Hubs";
import { LangPicker } from "./LangPicker";
import { Legal } from "./Legal";
import { filterRange, rangeText, meParent } from "./me-logic";
import { InPane, Tile } from "./parts";
import { Place } from "./Place";
import { PlaceQr } from "./PlaceQr";
import { Reissue } from "./Reissue";
import { Reset } from "./Reset";
import { Statements } from "./Statements";
import { StepAway } from "./StepAway";
import { Theme } from "./Theme";

export type Sub = "hub-profile" | "age" | "move" | "hub-visibility" | "hub-security" | "name" | "theme" | "lang" | "filter" | "pin" | "reissue" | "away" | "place" | "place-qr" | "legal" | "statements" | "hidden" | "blocked" | "reset";
type Profile = { name: string; age: number; pending?: string; filter_age_min?: number | null; filter_age_max?: number | null };

export function Me({ client, onTab, onClosed, onMove, onAway, onMoved, open: opened = null }: { client: Client; onTab: (tab: Tab) => void; onClosed: () => void; onMove: () => void; onAway: (until: number) => void; onMoved: () => void; open?: Sub | null }) {
  const [sub, setSub] = useState<Sub | null>(opened);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restrictions, setRestrictions] = useState(0);
  // How many I hid and whom I blocked (tablet_834_Me: «Hidden phrases 2», «Blocked 1»): the lists' own calls; a refusal shows no number.
  const [hidden, setHidden] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<number | null>(null);
  const wide = useMinWidth("--bp-tablet");
  // desktop_1440 6-me: Me stays in the middle and the open sub-page sits in the right pane; with nothing open the pane shows the profile hub
  const desk = useMinWidth("--bp-desktop");
  const [moved, setMoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const place = storedPlace();
  useEffect(() => {
    client.profile()
      .then((p) => setProfile(p as unknown as Profile))
      .catch((e: Error) => setError(failedLine(e)));
    client.hidden().then((rows) => setHidden(rows.length)).catch(() => setHidden(null));
    client.blocks().then((rows) => setBlocked(rows.length)).catch(() => setBlocked(null));
    client.statements().then((s) => setRestrictions(s.length)).catch(() => setRestrictions(0));
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  // a screen that a hub opened goes back to its hub; the hubs and the rest go back to Me
  const done = () => { setSub(meParent(sub) as Sub | null); setRefresh((n) => n + 1); };
  const home = () => setSub(meParent(sub) as Sub | null);
  const range = profile ? filterRange(profile.age, profile.filter_age_min, profile.filter_age_max) : null;

  const shown: Sub | null = desk ? sub ?? "hub-profile" : sub;
  const page = ((): ReactElement | null => { switch (shown) {
    case "name": return profile ? <EditName client={client} name={profile.pending ?? profile.name} age={profile.age} noAge={desk} onDone={done} onBack={home} /> : null;
    case "age": return profile ? desk ? <EditAge client={client} age={profile.age} onDone={done} onBack={home} />
      : <EditName client={client} name={profile.pending ?? profile.name} age={profile.age} onDone={done} onBack={home} /> : null;
    case "move": return <Departure client={client} onBack={home} onGone={onMoved} onApproved={() => setMoved(true)} />;
    case "pin": return <ChangePin client={client} onDone={done} onBack={home} />;
    case "reset": return <Reset client={client} onClosed={onClosed} onBack={home} />;
    case "place": return <Place onChosen={done} onBack={home} onQr={() => setSub("place-qr")} />;
    case "place-qr": return <PlaceQr place={place} onBack={home} />;
    case "hub-profile": case "hub-visibility": case "hub-security":
      return <HubPage hub={shown.slice(4) as "profile" | "visibility" | "security"} name={profile ? profile.pending ?? profile.name : null} age={profile ? profile.age : null} range={range} hidden={hidden} blocked={blocked} onGo={setSub} onMove={desk ? () => setSub("move") : onMove} onBack={() => setSub(null)} />;
    case "theme": return <Theme onBack={home} />;
    case "lang": return <LangPicker onBack={home} />;
    case "legal": return <Legal client={client} onDone={done} onBack={home} />;
    case "hidden": return <Hidden client={client} onBack={done} />;
    case "blocked": return <Blocked client={client} onBack={done} />;
    case "statements": return <Statements client={client} onBack={home} />;
    case "away": return <StepAway client={client} onGone={onAway} onBack={home} />;
    case "filter": return profile ? <AgeFilter client={client} age={profile.age} min={profile.filter_age_min} max={profile.filter_age_max} onBack={done} /> : null;
    case "reissue": return <Reissue client={client} onDone={done} onBack={home} />;
  } return null; })();
  if (page && !desk) return page;
  if (desk && moved) return <DepartureDone onGone={onMoved} />;

  return (
    <Screen name="me" title={label("me.title")} className="k-screen">
      <div className="k-col">
        {/* newdesign3 .uhead (frontend/components.css, 28.10): the face in its circle, the name in a pill, the action round */}
        <header className="k-uhead" aria-label={label("me.name")}>
            <span className="k-uhead-lead" aria-hidden="true"><NdIcon name="me" /></span>
            <div className="k-uhead-title">
              <h1 data-testid="me-name-age">{profile ? `${profile.pending ?? profile.name}, ${profile.age}` : "…"}</h1>
              {/* from the tablet up the place opens from this line: tablet_834_Me draws no place row, so the list keeps the sheet's ten */}
              <p className="k-meta">{wide
                ? <button type="button" onClick={() => setSub("place")} data-testid="me-place">{place.chosen ? say("app.me.on_device_at", { place: place.name }) : say("app.me.on_device")}</button>
                : place.chosen ? say("app.me.on_device_at", { place: place.name }) : say("app.me.on_device")}</p>
            </div>
            <button type="button" className="k-uhead-btn" aria-label={say("app.me.edit")} disabled={!profile} onClick={() => setSub("name")} data-testid="me-name"><NdIcon name="pen" /></button>
        </header>
        {error && <section className="k-panel"><p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p></section>}
        {restrictions > 0 && (
          <section className="k-panel k-pad8">
            <button type="button" className="k-note" role="status" onClick={() => setSub("statements")} data-testid="me-statements">
              <NdIcon name="flag" /><span>{say("statements.count", { n: restrictions })}</span><NdIcon name="chev" className="k-chev" />
            </button>
          </section>
        )}
        <section className="k-panel k-grow k-pad8">
          <nav className="k-hub" aria-label={label("me.title")}>
            <Tile icon="me" c={1} text={hubTitle("profile")} value={hubSub("profile")} testid="me-hub-profile" onOpen={() => setSub("hub-profile")} />
            <Tile icon="eye" c={4} text={hubTitle("visibility")} value={hubSub("visibility")} testid="me-hub-visibility" onOpen={() => setSub("hub-visibility")} />
            <Tile icon="shield" c={5} text={hubTitle("security")} value={hubSub("security")} testid="me-hub-security" onOpen={() => setSub("hub-security")} />
            <Tile icon="door" c={2} text={label("away.item")} value={wide ? awayValue() : undefined} testid="me-away" onOpen={() => setSub("away")} />
            <Tile icon="doc" c={1} text={label("web.legal.item")} testid="me-legal" onOpen={() => setSub("legal")} />
            {/* desktop me.svg, the 6th tile «i» (owner 28.10): «About the app» opens the documents */}
            {wide && <Tile icon="info" c={3} text={say("app.me.about")} testid="me-about" onOpen={() => setSub("legal")} />}
            {!wide && <Tile icon="place" c={6} text={say("app.place.title")} value={place.chosen ? place.name : undefined} testid="me-place" onOpen={() => setSub("place")} />}
          </nav>
        </section>
        <TabBar active="me" onSelect={onTab} />
      </div>
      {desk && page && <aside className="k-me-pane" data-testid="me-pane" data-open={shown ?? undefined}><InPane.Provider value={true}>{page}</InPane.Provider></aside>}
    </Screen>
  );
}
