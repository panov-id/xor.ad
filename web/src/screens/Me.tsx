// "Me" and what opens from it (W4, 2026-09-26), on depth/ink/rooms.ts Me,
// EditProfile, ChangePin, StartAgain, StepAway and Away — the same rows, the
// same words (depth/ink/locales/ru.json through api/me.ts), the same node
// calls through the same core. Not here: liked, hidden, blocked (W2), the
// paper code and the move (later steps).

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { AWAY_MINUTES, AWAY_ORDER, type AwaySpan, awayCounts, graphemes, NAME_MAX, pinRefusal, profileRefusal, resetCounts, say } from "../api/me.ts";
import { useMe } from "./logic/useMe.ts";
import { changePinAndReseal, forget } from "../vault.ts";
import { Button } from "../ui/Button.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";
import { Info } from "../ui/Info.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { BRAND } from "../config.ts";
import { AUTO, applyTheme, type Choice, readChoice, saveChoice } from "../theme.ts";
import { THEMES } from "../themes.gen.ts";
import "./place.css";

export type MeRow = "statements" | "name" | "age" | "hidden" | "blocked" | "away" | "pin" | "move" | "reissue" | "reset" | "theme";

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
  const rows: Array<{ key: MeRow; label: string; red?: boolean; testid: string; icon?: IconName }> = [
    ...(restrictions > 0 ? [{ key: "statements" as const, label: say("statements.count", { n: restrictions }), red: true, testid: "me-statements", icon: "report" as const }] : []),
    { key: "name", label: `${say("me.name")}  ${profile ? profile.name + (profile.pending ? ` → ${profile.pending} · ${say("feed.checking")}` : "") : "…"}`, testid: "me-name", icon: "name" },
    { key: "age", label: `${say("me.age")}  ${profile ? profile.age : "…"}`, testid: "me-age", icon: "me" },
    { key: "hidden", label: hidden === null ? say("feed.hidden") : `${say("feed.hidden")} · ${hidden}`, testid: "me-hidden", icon: "hide" },
    ...(blocked > 0 ? [{ key: "blocked" as const, label: say("blocked.count", { n: blocked }), testid: "me-blocked", icon: "block" as const }] : []),
    { key: "theme", label: say("web.theme.item"), testid: "me-theme", icon: "eye" },
    { key: "away", label: say("away.item"), testid: "me-away", icon: "timer" },
    { key: "pin", label: say("pin.item"), testid: "me-pin", icon: "key" },
    { key: "move", label: say("move.item"), testid: "me-move", icon: "arrive" },
    { key: "reissue", label: say("reissue.item"), testid: "me-reissue", icon: "code" },
    { key: "reset", label: say("reset.item"), testid: "me-reset", icon: "reset" },
  ];
  return (
    <main className={["screen me", brandClass].filter(Boolean).join(" ")} data-screen="me" data-name-state={profile?.pending ? "pending" : "accepted"}>
      <HeaderScreen title={say("me.title")} action={<Button type="button" icon="back" aria-label={say("common.back")} onClick={onBack} data-testid="me-back" />} />
      {error && <p className="error" data-testid="error">{error}</p>}
      <ul className="place-rows">
        {rows.map((row) => (
          <li key={row.key} data-row={row.key}>
            <button
              type="button"
              className={row.red ? "place-setting warn" : "place-setting"}
              data-testid={row.testid}
              // Name and age open with the profile's value: until it has come
              // the row is shown but not pressable, instead of a press that does
              // nothing (it lost shoot-web's Me-edit-name to that race, WD7).
              disabled={(row.key === "name" || row.key === "age") && !profile}
              onClick={() => {
                if (row.key === "name") return profile && onOpen("name", profile.pending ?? profile.name);
                if (row.key === "age") return profile && onOpen("age", String(profile.age));
                onOpen(row.key);
              }}
            >
              {row.icon ? <Icon name={row.icon} /> : null}
              <span>{row.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

// The brand's themes (theme.ts, themes.gen.ts): one radio per selectable
// theme plus "auto". A swatch is drawn by the theme's own tokens — the swatch
// element carries data-brand/data-theme, so themes.gen.css resolves --bg and
// --accent to that theme there. The names are data (English), not words of
// the dictionaries. Kept on this device (localStorage theme:<brand>).
export function ThemePicker({ onBack }: { onBack: () => void }) {
  const [choice, setChoice] = useState<Choice>(() => readChoice(BRAND));
  const pick = (next: Choice) => {
    saveChoice(BRAND, next);
    setChoice(next);
    applyTheme(BRAND);
  };
  const options: Array<{ id: Choice; label: string; swatch: string }> = [
    { id: AUTO, label: say("web.theme.auto"), swatch: "light" },
    ...(THEMES[BRAND] ?? []).map((t) => ({ id: t.id, label: t.name, swatch: t.id })),
  ];
  return (
    <main className="screen theme" data-screen="theme">
      <HeaderScreen title={say("web.theme.title")} action={<Button type="button" icon="back" aria-label={say("common.back")} onClick={onBack} data-testid="theme-back" />} />
      <div role="radiogroup" aria-label={say("web.theme.title")} className="theme-options">
        {options.map((o) => (
          <label key={o.id} className="theme-option" data-testid={`theme-${o.id}`}>
            <input type="radio" name="theme" value={o.id} checked={choice === o.id} onChange={() => pick(o.id)} />
            <span className="theme-swatch" data-brand={BRAND} data-theme={o.swatch} aria-hidden="true">
              <span className="theme-dot" />
            </span>
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </main>
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
      setRefused(profileRefusal(answer) ?? `the profile edit was refused: ${answer.status}`);
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="screen edit" data-screen={`edit-${field}`}>
      <HeaderScreen title={say(field === "name" ? "me.name" : "me.age")} />
      <p className="muted">{say(field === "name" ? "me.nameHint" : "me.ageHint")}</p>
      <label>
        {say(field === "name" ? "me.name" : "me.age")}
        <input
          value={value}
          onChange={(e) => setValue(field === "age" ? e.target.value.replace(/[^0-9]/g, "").slice(0, 3) : graphemes(e.target.value, NAME_MAX))}
          inputMode={field === "age" ? "numeric" : "text"}
          data-testid="edit-value"
          autoComplete="off"
        />
      </label>
      {refused && <p className="error" data-testid="error">{refused}</p>}
      {asking
        ? (
          <>
            <p className="warn">{say("me.band21")}</p>
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
    </main>
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
      setRefused(pinRefusal(answer) ?? `the PIN change was refused: ${answer.status}`);
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = (key: keyof typeof values, label: string, testid: string) => (
    <label>
      {label}
      <input type="password" inputMode="numeric" value={values[key]} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value.replace(/\D/g, "").slice(0, 6) }))} data-testid={testid} />
    </label>
  );
  return (
    <main className="screen pin" data-screen="change-pin" data-changed={changed ? "yes" : "no"}>
      <HeaderScreen title={say("pin.title")} />
      {changed
        ? (
          <>
            <p data-testid="pin-changed">{say("pin.changed")}</p>
            <Button type="button" kind="primary" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="pin-back" />
          </>
        )
        : (
          <>
            {field("current", say("pin.current"), "pin-current")}
            {field("next", say("pin.next"), "pin-next")}
            {field("again", say("pin.again"), "pin-again")}
            {differ && <p className="error">{say("reg.pinMismatch")}</p>}
            {refused && <p className="error" data-testid="error">{refused}</p>}
            <Button type="button" kind="primary" icon="check" className="ui-wide" aria-label={say("pin.go")} aria-busy={busy} disabled={!ready} onClick={() => void send()} data-testid="pin-go" />
            <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="pin-back" />
          </>
        )}
    </main>
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
      setRefused(pinRefusal(answer) ?? `the close was refused: ${answer.status}`);
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="screen reset" data-screen="reset">
      <HeaderScreen title={say("reset.title")} />
      {/* What cannot be undone is said on the screen, not behind ⓘ: the button below is an icon. */}
      <p className="warn" data-testid="reset-warning">{say("reset.warning")}</p>
      <p className="warn" data-testid="reset-code">{say("reset.code")}</p>
      <p data-testid="reset-price">{counts ? say("reset.price", { phrases: String(counts.phrases), chats: String(counts.chats) }) : "…"}</p>
      <label>
        {say("reset.pin")}
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="reset-pin" />
      </label>
      {refused && <p className="error" data-testid="error">{refused}</p>}
      <Button type="button" kind="danger" icon="reset" className="ui-wide" aria-label={say("reset.go")} disabled={pin.length !== 6 || counts === null || busy} onClick={() => void send()} data-testid="reset-go" />
      <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="reset-back" />
    </main>
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
    <main className="screen step-away" data-screen="step-away">
      <HeaderScreen title={say("away.item")} />
      <ul className="place-rows">
        {AWAY_ORDER.map((s) => (
          <li key={s}>
            <button type="button" className={span === s ? "place-setting chosen" : "place-setting"} onClick={() => setSpan(s)} data-testid={`away-${s}`}>{say(`away.${s}`)}</button>
          </li>
        ))}
      </ul>
      <p className={span ? "warn" : "muted"} data-testid="away-price">{price()}</p>
      <div className="ui-info-row"><Info label={say("away.item")} data-testid="away-warning-info"><p>{say("away.warning")}</p></Info></div>
      {error && <p className="error" data-testid="error">{error}</p>}
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
    </main>
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
    <main className="screen away" data-screen="away">
      <p data-testid="away-line">{say("away.line")}</p>
      <p className="muted">{say("away.until", { time: at, minutes: left })}</p>
      {asking && <p className="warn" data-testid="away-sure">{say("away.sure")}</p>}
      {error && <p className="error" data-testid="error">{error}</p>}
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
    </main>
  );
}
