// w4_me (sosed Dusk, mobile): the name card, the settings as rows, the tab bar; what each row opens is its own
// screen in this folder (w4_me-edit-name, w4_me-pin, w4_me-reset, w4_place, w4_place-qr, w4_theme, w4_legal,
// w4_statements, w4_step-away, w4_age-filter). The web's Me (web screens/Me.tsx) through the same SDK calls:
// client.profile, statements; the rows' testids are the web's (me-name, me-theme, me-lang, me-filter, me-pin,
// me-reissue, me-move, me-away, me-legal, me-reset, me-statements) plus me-place.
//
// Not here yet (rows drawn, opening a titled stand-in): a new paper code (w4_reissue-*), the move (w4_wizard-*);
// hidden and blocked (w4_hidden, w4_blocked); the step-away's own "away" screen (w2_away).
import { useEffect, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { label, LANG, nameOf, say } from "../../i18n";
import { storedPlace } from "../../place";
import { Icon } from "../../shell/Icon";
import { Screen } from "../../shell/Screen";
import { TabBar, type Tab } from "../../shell/TabBar";
import { AgeFilter } from "./AgeFilter";
import { ChangePin } from "./ChangePin";
import { EditName } from "./EditName";
import { LangPicker } from "./LangPicker";
import { Legal } from "./Legal";
import { filterRange, initial, rangeText } from "./me-logic";
import { Row, SubPage } from "./parts";
import { Place } from "./Place";
import { PlaceQr } from "./PlaceQr";
import { Reset } from "./Reset";
import { Statements } from "./Statements";
import { StepAway } from "./StepAway";
import { Theme } from "./Theme";
import { chevronRight } from "../../shell/icons";

export type Sub = "name" | "theme" | "lang" | "filter" | "pin" | "reissue" | "move" | "away" | "place" | "place-qr" | "legal" | "statements" | "reset";
type Profile = { name: string; age: number; pending?: string; filter_age_min?: number | null; filter_age_max?: number | null };

export function Me({ client, onTab, onClosed, open: opened = null }: { client: Client; onTab: (tab: Tab) => void; onClosed: () => void; open?: Sub | null }) {
  const [sub, setSub] = useState<Sub | null>(opened);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restrictions, setRestrictions] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const place = storedPlace();
  useEffect(() => {
    client.profile()
      .then((p) => setProfile(p as unknown as Profile))
      .catch((e: Error) => setError(e.message));
    client.statements().then((s) => setRestrictions(s.length)).catch(() => setRestrictions(0));
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => { setSub(null); setRefresh((n) => n + 1); };
  const home = () => setSub(null);

  switch (sub) {
    case "name": return profile ? <EditName client={client} name={profile.pending ?? profile.name} age={profile.age} onDone={done} onBack={home} /> : null;
    case "pin": return <ChangePin client={client} onDone={done} onBack={home} />;
    case "reset": return <Reset client={client} onClosed={onClosed} onBack={home} />;
    case "place": return <Place onChosen={done} onBack={home} onQr={() => setSub("place-qr")} />;
    case "place-qr": return <PlaceQr place={place} onBack={() => setSub("place")} />;
    case "theme": return <Theme onBack={home} />;
    case "lang": return <LangPicker onBack={home} />;
    case "legal": return <Legal client={client} onDone={done} onBack={home} />;
    case "statements": return <Statements client={client} onBack={home} />;
    case "away": return <StepAway client={client} onGone={done} onBack={home} />;
    case "filter": return profile ? <AgeFilter client={client} age={profile.age} min={profile.filter_age_min} max={profile.filter_age_max} onBack={done} /> : null;
    case "reissue": case "move": {
      const title = label(sub === "reissue" ? "reissue.item" : "move.item");
      return <SubPage name={sub} title={title} onBack={home}><p className="me-quiet">{say("app.me.not_yet")}</p></SubPage>;
    }
  }

  const range = profile ? filterRange(profile.age, profile.filter_age_min, profile.filter_age_max) : null;
  return (
    <Screen name="me" title={label("me.title")} className="me">
      <header className="me-head"><span className="word">sosed</span></header>
      <div className="me-sheet me-home">
        <div className="me-body">
          <section className="me-hero" aria-label={label("me.name")}>
            <span className="me-avatar" aria-hidden="true">{profile ? initial(profile.name) : ""}</span>
            <div className="me-who">
              <h1 data-testid="me-name-age">{profile ? `${profile.pending ?? profile.name}, ${profile.age}` : "…"}</h1>
              <p>{place.chosen ? say("app.me.on_device_at", { place: place.name }) : say("app.me.on_device")}</p>
            </div>
            <button type="button" className="me-edit" disabled={!profile} onClick={() => setSub("name")} data-testid="me-name">{say("app.me.edit")}</button>
          </section>
          {error && <p className="me-error" role="alert" data-testid="error">{error}</p>}
          <nav className="me-rows" aria-label={label("me.title")}>
            {restrictions > 0 && <Row text={say("statements.count", { n: restrictions })} testid="me-statements" onOpen={() => setSub("statements")} />}
            <Row text={label("web.theme.item")} value={say("app.theme.dusk")} testid="me-theme" onOpen={() => setSub("theme")} />
            <Row text={label("web.lang.item")} value={nameOf(LANG)} testid="me-lang" onOpen={() => setSub("lang")} />
            <Row text={label("web.filter.item")} value={range ? rangeText(range) : "…"} testid="me-filter" onOpen={() => profile && setSub("filter")} />
            <Row text={label("pin.item")} testid="me-pin" onOpen={() => setSub("pin")} />
            <Row text={label("reissue.item")} testid="me-reissue" onOpen={() => setSub("reissue")} />
            <Row text={label("move.item")} testid="me-move" onOpen={() => setSub("move")} />
            <Row text={label("away.item")} testid="me-away" onOpen={() => setSub("away")} />
            <Row text={say("app.place.title")} value={place.chosen ? place.name : undefined} testid="me-place" onOpen={() => setSub("place")} />
            <Row text={label("web.legal.item")} testid="me-legal" onOpen={() => setSub("legal")} />
            <button type="button" className="me-row me-danger" onClick={() => setSub("reset")} data-testid="me-reset">
              <span className="me-row-text"><span className="me-row-name">{label("reset.item")}</span></span><Icon d={chevronRight} className="me-chev" />
            </button>
          </nav>
        </div>
      </div>
      <TabBar active="me" onSelect={onTab} />
    </Screen>
  );
}
