// The three hubs of "Me" (docs/newdesign/proto: me-profile, me-visibility, me-security): a bar with back and the title, a panel
// of tiles; each tile opens the screen the row used to open. The tiles keep the rows' testids (me-theme, me-lang, ...).
import { AWAY_ORDER } from "@sdk/limits.ts";
import { label, LANG, nameOf, say } from "../../i18n";
import { readChoice } from "../../brands/sosed/theme";
import { rangeText, type Range } from "./me-logic";
import { DangerBar, SubPage, Tile } from "./parts";

export type Hub = "profile" | "visibility" | "security";
export type Go = (sub: "name" | "theme" | "lang" | "filter" | "hidden" | "blocked" | "pin" | "reissue" | "reset") => void;

/** The title of a hub and of its tile on Me (the prototype's: profile, visibility, safety), and the line under it on Me. */
export const hubTitle = (hub: Hub): string => say(`app.me.hub_${hub}`);
export const hubSub = (hub: Hub): string => say(`app.me.hub_${hub}_sub`);

export function HubPage({ hub, name, age, range, hidden, blocked, onGo, onMove, onBack }: {
  hub: Hub; name: string | null; age: number | null; range: Range | null; hidden: number | null; blocked: number | null; onGo: Go; onMove: () => void; onBack: () => void;
}) {
  return (
    <SubPage name={`me-${hub}`} title={hubTitle(hub)} onBack={onBack} bare
      foot={hub === "security" ? <DangerBar text={label("reset.item")} testid="me-reset" onOpen={() => onGo("reset")} /> : undefined}>
      <nav className="k-hub" data-hub={hub} aria-label={hubTitle(hub)}>
        {hub === "profile" && (
          <>
            <Tile icon="me" c={1} text={label("me.name")} value={name ?? "…"} testid="me-name-tile" onOpen={() => onGo("name")} />
            <Tile icon="clock" c={5} text={label("app.reg.age")} value={age === null ? "…" : String(age)} testid="me-age-tile" onOpen={() => onGo("name")} />
            <Tile icon="theme" c={1} text={label("web.theme.item")} value={say(`app.theme.${readChoice()}`)} testid="me-theme" onOpen={() => onGo("theme")} />
            <Tile icon="lang" c={4} text={label("web.lang.item")} value={nameOf(LANG)} testid="me-lang" onOpen={() => onGo("lang")} />
          </>
        )}
        {hub === "visibility" && (
          <>
            <Tile wide icon="eye" c={5} text={label("web.filter.item")} value={range ? rangeText(range) : "…"} testid="me-filter" onOpen={() => onGo("filter")} />
            <Tile small icon="hide" c={6} text={label("app.me.hidden")} count={hidden === null ? undefined : String(hidden)} testid="me-hidden" onOpen={() => onGo("hidden")} />
            <Tile small icon="block" c={5} text={label("app.me.blocked")} count={blocked === null ? undefined : String(blocked)} testid="me-blocked" onOpen={() => onGo("blocked")} />
          </>
        )}
        {hub === "security" && (
          <>
            <Tile icon="lock" c={5} text={label("pin.item")} testid="me-pin" onOpen={() => onGo("pin")} />
            <Tile icon="paper" c={1} text={label("reissue.item")} testid="me-reissue" onOpen={() => onGo("reissue")} />
            <Tile wide icon="move" c={3} text={label("move.item")} testid="me-move" onOpen={onMove} />
          </>
        )}
      </nav>
    </SubPage>
  );
}

export const awayValue = (): string => AWAY_ORDER.map((s) => say(`app.stepaway.${s}`)).join(" · ");
