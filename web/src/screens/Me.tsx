// "Me" and what opens from it (W4, 2026-09-26), on depth/ink/rooms.ts Me,
// EditProfile, ChangePin, StartAgain, StepAway and Away — the same rows, the
// same words (depth/ink/locales/ru.json through api/me.ts), the same node
// calls through the same core. Not here: liked, hidden, blocked (W2), the
// paper code and the move (later steps). Built of the kit's elements only
// (web/src/ui, K5): no raw control and no class of its own.

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { AWAY_MINUTES, AWAY_ORDER, type AwaySpan, awayCounts, graphemes, NAME_MAX, pinRefusal, profileRefusal, resetCounts, say } from "../api/me.ts";
import { useMe } from "./logic/useMe.ts";
import { AgeFilter } from "./AgeFilter.tsx";
import { Legal } from "./Legal.tsx";
import { changePinAndReseal, forget } from "../vault.ts";
import { Button } from "../ui/Button.tsx";
import { Field, PinField } from "../ui/Field.tsx";
import type { IconName } from "../ui/Icon.tsx";
import { Info } from "../ui/Info.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { List, ListItem } from "../ui/List.tsx";
import { Notice } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Choice } from "../ui/Segments.tsx";
import { SettingRow } from "../ui/SettingRow.tsx";
import { BRAND } from "../config.ts";
import { AUTO, applyTheme, type Choice as ThemeChoice, readChoice, saveChoice } from "../theme.ts";
import { THEMES } from "../themes.gen.ts";
import { duration } from "../locales/duration.ts";
import { chooseLanguage, LANG, LANGUAGES, languageName } from "../locales/say.ts";
import "./place.css";

// "filter" and "legal" open here, not through the parent (W14-AF, W13-LC):
// the age filter and screen 15 are Me's own screens.
export type MeRow = "statements" | "name" | "age" | "filter" | "hidden" | "blocked" | "legal" | "away" | "pin" | "move" | "reissue" | "reset" | "theme" | "lang";

const back = (onBack: () => void, testid: string) => <Button type="button" icon="back" aria-label={say("common.back")} onClick={onBack} data-testid={testid} />;

export function Me({ client, restrictions, onOpen, onBack, refresh, brandClass }: {
  brandClass?: string;
  client: Client;
  restrictions: number;
  onOpen: (row: MeRow, current?: string) => void;
  onBack: () => void;
  // Bumped by a parent after an edit, so the profile is read again.
  refresh: number;
}) {
  const { profile, error, hidden, blocked } = useMe({ client, refresh });
  // Both states before either early return: hooks run in the same order every render.
  const [filtering, setFiltering] = useState(false);
  const [legal, setLegal] = useState(false);
  const [choosingLang, setChoosingLang] = useState(false);
  if (filtering) return <AgeFilter client={client} onDone={() => setFiltering(false)} onBack={() => setFiltering(false)} />;
  if (legal) return <Legal client={client} onDone={() => setLegal(false)} onBack={() => setLegal(false)} />;
  if (choosingLang) return <LanguagePicker onBack={() => setChoosingLang(false)} />;
  // `label` is the row's name, `value` what it holds now; a row with no value
  // carries its whole words in the label.
  const rows: Array<{ key: MeRow; label: string; value?: string; danger?: boolean; testid: string; icon?: IconName }> = [
    ...(restrictions > 0 ? [{ key: "statements" as const, label: say("statements.count", { n: restrictions }), danger: true, testid: "me-statements", icon: "report" as const }] : []),
    // A refused name is said here (§8.2, chat_RU.md:866: it is edited always):
    // the row carries the words and opens the editor, as it does for any name (W13-NR).
    {
      key: "name",
      label: say("me.name"),
      value: profile
        ? profile.name + (profile.pending ? ` → ${profile.pending} · ${say("feed.checking")}` : profile.state === "rejected" ? ` · ${say("web.me.name_rejected")}` : "")
        : "…",
      testid: "me-name",
      icon: "name",
    },
    { key: "age", label: say("me.age"), value: profile ? String(profile.age) : "…", testid: "me-age", icon: "me" },
    { key: "filter", label: say("web.filter.item"), testid: "me-filter", icon: "me" },
    { key: "hidden", label: hidden === null ? say("feed.hidden") : `${say("feed.hidden")} · ${hidden}`, testid: "me-hidden", icon: "hide" },
    ...(blocked > 0 ? [{ key: "blocked" as const, label: say("blocked.count", { n: blocked }), testid: "me-blocked", icon: "block" as const }] : []),
    { key: "theme", label: say("web.theme.item"), testid: "me-theme", icon: "eye" },
    // С10 (walk 11.10): «отойти» says what it is, in the row.
    { key: "away", label: say("away.item"), value: say("web.me.away_hint"), testid: "me-away", icon: "timer" },
    { key: "pin", label: say("pin.item"), testid: "me-pin", icon: "key" },
    { key: "move", label: say("move.item"), testid: "me-move", icon: "arrive" },
    { key: "reissue", label: say("reissue.item"), testid: "me-reissue", icon: "code" },
    // Among the wide service rows, not between the settings: in sosed's bento a
    // row amid the half tiles breaks their pairs (W16-MD). The language too
    // (WP-3: put after "theme" it left "change PIN" alone, the Me sheet's
    // drift 16% → 25%).
    { key: "lang", label: say("web.lang.item"), value: languageName(LANG), testid: "me-lang", icon: "say" },
    { key: "legal", label: say("web.legal.item"), testid: "me-legal", icon: "report" },
    { key: "reset", label: say("reset.item"), testid: "me-reset", icon: "reset" },
  ];
  return (
    <Screen
      name="me"
      title={say("me.title")}
      className={brandClass}
      data-name-state={profile ? (profile.pending ? "pending" : profile.state) : "accepted"}
      header={<HeaderScreen title={say("me.title")} action={back(onBack, "me-back")} />}
    >
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
      <List label={say("me.title")}>
        {rows.map((row) => (
          <ListItem key={row.key} data-row={row.key}>
            <SettingRow
              label={row.label}
              value={row.value}
              danger={row.danger}
              icon={row.icon}
              data-testid={row.testid}
              // Name and age open with the profile's value: until it has come
              // the row is shown but not pressable, instead of a press that does
              // nothing (it lost shoot-web's Me-edit-name to that race, WD7).
              disabled={(row.key === "name" || row.key === "age") && !profile}
              onSelect={() => {
                if (row.key === "name") return profile && onOpen("name", profile.pending ?? profile.name);
                if (row.key === "age") return profile && onOpen("age", String(profile.age));
                if (row.key === "filter") return setFiltering(true);
                if (row.key === "legal") return setLegal(true);
                if (row.key === "lang") return setChoosingLang(true);
                onOpen(row.key);
              }}
            />
          </ListItem>
        ))}
      </List>
    </Screen>
  );
}

// The brand's themes (theme.ts, themes.gen.ts): one choice per selectable
// theme plus "auto". A swatch is drawn by the theme's own tokens — the swatch
// element carries data-brand/data-theme, so themes.gen.css resolves --bg and
// --accent to that theme there. The names are data (English), not words of
// the dictionaries. Kept on this device (localStorage theme:<brand>).
export function ThemePicker({ onBack }: { onBack: () => void }) {
  const [choice, setChoice] = useState<ThemeChoice>(() => readChoice(BRAND));
  const pick = (next: string) => {
    saveChoice(BRAND, next);
    setChoice(next);
    applyTheme(BRAND);
  };
  const options: Array<{ id: ThemeChoice; label: string; swatch: string }> = [
    { id: AUTO, label: say("web.theme.auto"), swatch: "light" },
    ...(THEMES[BRAND] ?? []).map((t) => ({ id: t.id, label: t.name, swatch: t.id })),
  ];
  return (
    <Screen name="theme" title={say("web.theme.title")} header={<HeaderScreen title={say("web.theme.title")} action={back(onBack, "theme-back")} />}>
      <Choice
        label={say("web.theme.title")}
        value={choice}
        onChange={pick}
        options={options.map((o) => ({
          value: o.id,
          label: o.label,
          testid: `theme-${o.id}`,
          sample: <span className="ui-swatch" data-brand={BRAND} data-theme={o.swatch} aria-hidden="true"><span className="ui-swatch-dot" /></span>,
        }))}
      />
    </Screen>
  );
}

// The page's language, one choice per language both dictionaries know, each
// named in itself (locales/say.ts languageName), so a person who cannot read
// the current one still finds their own. Kept on this device; choosing one
// reloads the page in it (WP-3).
export function LanguagePicker({ onBack }: { onBack: () => void }) {
  return (
    <Screen name="lang" title={say("web.lang.title")} header={<HeaderScreen title={say("web.lang.title")} action={back(onBack, "lang-back")} />}>
      <Choice
        label={say("web.lang.title")}
        value={LANG}
        onChange={chooseLanguage}
        options={LANGUAGES.map((lang) => ({ value: lang, label: languageName(lang), lang, testid: `lang-${lang}` }))}
      />
    </Screen>
  );
}

// Editing the name or the age (§4.11): the node decides and says why not.
// Crossing 20/21 upwards is asked before saving, since it cannot be undone.
export function EditProfile({ client, field, current, onDone, onBack }: {
  client: Client;
  field: "name" | "age";
  current: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const [value, setValue] = useState(current);
  const [asking, setAsking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const crossesUp = () => field === "age" && Number(current) <= 20 && Number(value) >= 21;
  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      const answer = await client.editProfile(field === "name" ? { name: value.trim() } : { age: Number(value) });
      if (answer.status === 200 || answer.status === 202) return onDone();
      setRefused(profileRefusal(answer) ?? say("web.refused.status", { status: answer.status }));
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title = say(field === "name" ? "me.name" : "me.age");
  return (
    <Screen name={`edit-${field}`} title={title} header={<HeaderScreen title={title} />}>
      <Field
        label={title}
        kind={field === "name" ? "text" : "number"}
        hint={say(field === "name" ? "web.me.nameHint" : "me.ageHint")}
        value={value}
        onChange={(next) => setValue(field === "age" ? next.replace(/[^0-9]/g, "").slice(0, 3) : graphemes(next, NAME_MAX))}
        data-testid="edit-value"
      />
      {refused && <ErrorLine data-testid="error">{refused}</ErrorLine>}
      {asking
        ? (
          <>
            <Notice>{say("me.band21")}</Notice>
            <Button type="button" kind="primary" icon="check" className="ui-wide" aria-label={say("me.save")} onClick={() => { setAsking(false); void send(); }} data-testid="edit-save" />
            <Button type="button" icon="close" className="ui-wide" aria-label={say("me.cancel")} onClick={() => setAsking(false)} />
          </>
        )
        : (
          <>
            <Button
              type="button"
              kind="primary"
              icon="check"
              className="ui-wide"
              aria-label={say("me.save")}
              disabled={busy || value.trim() === "" || value.trim() === current}
              onClick={() => (crossesUp() ? setAsking(true) : void send())}
              data-testid="edit-save"
            />
            <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="edit-back" />
          </>
        )}
    </Screen>
  );
}

// "Change the PIN" (depth-client §3.6): the old one, the new one twice; the
// vault on this device is re-sealed under the new PIN in the same move
// (vault.ts changePinAndReseal), or the next reload would not open.
export function ChangePin({ client, onBack }: { client: Client; onBack: () => void }) {
  const [values, setValues] = useState({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const six = (v: string) => v.length === 6;
  const differ = six(values.next) && six(values.again) && values.next !== values.again;
  const ready = six(values.current) && six(values.next) && values.next === values.again && !busy;
  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      const answer = await changePinAndReseal(client, values.current, values.next);
      if (answer.status === 200) {
        setValues({ current: "", next: "", again: "" });
        return setChanged(true);
      }
      setRefused(pinRefusal(answer) ?? say("web.refused.status", { status: answer.status }));
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pin = (key: keyof typeof values, label: string, testid: string, error?: string) => (
    <PinField label={label} value={values[key]} error={error} onChange={(next) => setValues((v) => ({ ...v, [key]: next }))} data-testid={testid} />
  );
  return (
    <Screen name="change-pin" title={say("pin.title")} data-changed={changed ? "yes" : "no"} header={<HeaderScreen title={say("pin.title")} />}>
      {changed
        ? (
          <>
            <p data-testid="pin-changed">{say("pin.changed")}</p>
            <Button type="button" kind="primary" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="pin-back" />
          </>
        )
        : (
          <>
            {pin("current", say("pin.current"), "pin-current")}
            {pin("next", say("pin.next"), "pin-next")}
            {pin("again", say("pin.again"), "pin-again", differ ? say("reg.pinMismatch") : undefined)}
            {refused && <ErrorLine data-testid="error">{refused}</ErrorLine>}
            <Button type="button" kind="primary" icon="check" className="ui-wide" aria-label={say("pin.go")} aria-busy={busy} disabled={!ready} onClick={() => void send()} data-testid="pin-go" />
            <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="pin-back" />
          </>
        )}
    </Screen>
  );
}

// "Start again" (§8.2, screen 12): what goes is counted before the PIN is
// asked, the paper code is named as dying with it, and the record on this
// device goes with the identity.
export function StartAgain({ client, onClosed, onBack }: { client: Client; onClosed: () => void; onBack: () => void }) {
  const [counts, setCounts] = useState<{ phrases: number; chats: number } | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  useEffect(() => {
    resetCounts(client).then(setCounts).catch((e: Error) => setRefused(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      const answer = await client.closeIdentity(pin);
      if (answer.status === 200) {
        await forget();
        return onClosed();
      }
      setRefused(pinRefusal(answer) ?? say("web.refused.status", { status: answer.status }));
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen name="reset" title={say("reset.title")} header={<HeaderScreen title={say("reset.title")} />}>
      {/* What cannot be undone is said on the screen, not behind ⓘ: the button below is an icon. */}
      <Notice data-testid="reset-warning">{say("reset.warning")}</Notice>
      <Notice data-testid="reset-code">{say("reset.code")}</Notice>
      <p data-testid="reset-price">{counts ? say("reset.price", { phrases: String(counts.phrases), chats: String(counts.chats) }) : "…"}</p>
      <PinField label={say("reset.pin")} value={pin} onChange={setPin} data-testid="reset-pin" />
      {refused && <ErrorLine data-testid="error">{refused}</ErrorLine>}
      <Button type="button" kind="danger" icon="reset" className="ui-wide" aria-label={say("reset.go")} disabled={pin.length !== 6 || counts === null || busy} onClick={() => void send()} data-testid="reset-go" />
      <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="reset-back" />
    </Screen>
  );
}

// Stepping away (§8.2; screen 20): nothing preselected, the price once a span
// is chosen, "step away" dead until then.
export function StepAway({ client, onGone, onBack }: { client: Client; onGone: (until: number) => void; onBack: () => void }) {
  const [span, setSpan] = useState<AwaySpan | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<{ phrases: number; likes: number; ends: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    awayCounts(client).then(setCounts).catch((e: Error) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const price = () => {
    if (!span || !counts) return say("away.pick");
    const back = Math.floor(Date.now() / 1000) + AWAY_MINUTES[span] * 60;
    return say("away.price", { phrases: counts.phrases, likes: counts.likes, chats: counts.ends.filter((end) => end < back).length, of: counts.ends.length });
  };
  return (
    <Screen name="step-away" title={say("away.item")} header={<HeaderScreen title={say("away.item")} />}>
      <Choice
        label={say("away.item")}
        value={span ?? ""}
        onChange={(next) => setSpan(next as AwaySpan)}
        options={AWAY_ORDER.map((s) => ({ value: s, label: say(`away.${s}`), testid: `away-${s}` }))}
      />
      {span ? <Notice data-testid="away-price">{price()}</Notice> : <p className="ui-hint" data-testid="away-price">{price()}</p>}
      <div className="ui-info-row"><Info label={say("away.item")} data-testid="away-warning-info"><p>{say("away.warning")}</p></Info></div>
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
      <Button
        type="button"
        kind="primary"
        icon="timer"
        className="ui-wide"
        aria-label={say("away.go")}
        disabled={span === null || busy}
        onClick={() => {
          if (!span) return;
          setBusy(true);
          client.stepAway(span).then(onGone).catch((e: Error) => { setBusy(false); setError(e.message); });
        }}
        data-testid="away-go"
      />
      <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="away-back" />
    </Screen>
  );
}

// While away (screen 20): one line, the hour it ends, and a way back that
// asks once more.
export function Away({ client, until, onBack }: { client: Client; until: number; onBack: () => void }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (now >= until) onBack();
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = new Date(until * 1000).toTimeString().slice(0, 5);
  const left = Math.max(1, Math.ceil((until - now) / 60));
  return (
    <Screen name="away" title={say("away.item")}>
      <p data-testid="away-line">{say("away.line")}</p>
      <p className="ui-hint">{say("web.away.until", { time: at, left: duration(left) })}</p>
      {asking && <Notice data-testid="away-sure">{say("away.sure")}</Notice>}
      {error && <ErrorLine data-testid="error">{error}</ErrorLine>}
      <Button
        type="button"
        kind="primary"
        icon="arrive"
        className="ui-wide"
        aria-label={say("away.back")}
        onClick={() => {
          if (!asking) return setAsking(true);
          client.comeBack().then(onBack).catch((e: Error) => setError(e.message));
        }}
        data-testid="away-return"
      />
    </Screen>
  );
}
