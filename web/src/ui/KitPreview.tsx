// The kit on one page, in the stand's build only (VITE_STAND=1, /kit):
// what the e2e spec kit.spec.ts drives — the Info balloon, the icon set, the
// like burst, and every input of step К2а in every state of its row (empty,
// filled, focus target, error, disabled with a reason, busy) — before any
// screen wears them. Not reachable in a real build. Every word is a key.
import { useState } from "react";
import { LANG, LANGUAGES, languageName, say } from "../locales/say.ts";
import { Button } from "./Button.tsx";
import { Card, type CardOf, LikeBurst } from "./Card.tsx";
import { Checkbox } from "./Checkbox.tsx";
import { Chip } from "./Chip.tsx";
import { Code } from "./Code.tsx";
import { CodeField } from "./CodeField.tsx";
import { Disclosure } from "./Disclosure.tsx";
import { Dot } from "./Dot.tsx";
import { ErrorLine, focusFirstInvalid } from "./ErrorLine.tsx";
import { Field, FieldGroup, type FieldKind, PinField } from "./Field.tsx";
import { HeaderFeed } from "./Header.tsx";
import { ICONS } from "./Icon.tsx";
import { Illustration } from "./Illustration.tsx";
import { InboxRow } from "./InboxRow.tsx";
import { Info } from "./Info.tsx";
import { Actions, Link, LinkButton } from "./Links.tsx";
import { List, ListItem } from "./List.tsx";
import { MessageInput } from "./MessageInput.tsx";
import { EmptyState, Notice } from "./Notices.tsx";
import { RangePair } from "./RangePair.tsx";
import { Screen } from "./Screen.tsx";
import { Choice, Segments } from "./Segments.tsx";
import { Select } from "./Select.tsx";
import { SettingRow } from "./SettingRow.tsx";
import { ActionSheet, Confirm } from "./Sheet.tsx";
import { StatusHeader, type StatusState } from "./Status.tsx";
import { TabBar } from "./TabBar.tsx";
import { Textarea } from "./Textarea.tsx";
import { Toast } from "./Toast.tsx";

const KINDS: FieldKind[] = ["text", "number", "email", "decimal", "datetime", "url"];
const LANGS = LANGUAGES.slice(0, 4);
const LANG_OPTIONS = LANGS.map((lang) => ({ value: lang, label: languageName(lang), lang }));

function years(n: number): string {
  try {
    return new Intl.NumberFormat(LANG, { style: "unit", unit: "year", unitDisplay: "long" }).format(n);
  } catch {
    return String(n);
  }
}

export function KitPreview() {
  const [liked, setLiked] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({ "filled-text": "Anya" });
  const field = (key: string) => ({ value: fields[key] ?? "", onChange: (value: string) => setFields((was) => ({ ...was, [key]: value })) });
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("123456");
  const [sent, setSent] = useState("");
  const [code, setCode] = useState<string[]>(["", "", "", ""]);
  const [codePair, setCodePair] = useState<string[]>(["", ""]);
  const [lang, setLang] = useState(LANGS[0]);
  const [segment, setSegment] = useState("phrase");
  const [choice, setChoice] = useState(LANGS[1]);
  const [range, setRange] = useState({ from: 18, to: 99 });
  const [wrongRange, setWrongRange] = useState({ from: 40, to: 20 });
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const modeLabel = say("web.composer.mode");
  const reason = say("web.legal.stale");
  const mode = [{ value: "phrase", label: say("web.composer.phrase") }, { value: "zone", label: say("web.composer.zone") }];
  const consent = <>{say("web.register.consent")} <Link href="#kit-link-target">{say("web.legal.terms")}</Link></>;
  const [tab, setTab] = useState("feed");
  const tabs = [
    { id: "feed", icon: "feed" as const, label: say("web.nav.feed"), testid: "kit-tab-feed" },
    { id: "inbox", icon: "say" as const, label: say("web.nav.inbox"), testid: "kit-tab-inbox" },
    { id: "me", icon: "me" as const, label: say("me.title"), testid: "kit-tab-me" },
  ].map((t) => ({ ...t, current: tab === t.id, onSelect: () => setTab(t.id) }));
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState(0);
  const [status, setStatus] = useState<StatusState>("on");
  const [toast, setToast] = useState<string | null>(null);
  const [autoToast, setAutoToast] = useState<string | null>(null);
  const [undone, setUndone] = useState(0);
  const when = new Intl.DateTimeFormat(LANG, { hour: "2-digit", minute: "2-digit" }).format(new Date(2026, 9, 10, 12, 30));
  const entities: [CardOf, string][] = [["phrase", "web.card.phrase"], ["table", "web.feed.newTable"], ["offer", "web.cabinet.offerChip"],
    ["match", "web.inbox.offer"], ["venue", "web.cabinet.offerLive"], ["preview", "web.composer.scheme"]];
  const nextStatus: Record<StatusState, StatusState> = { on: "connecting", connecting: "offline", offline: "failed", failed: "on" };
  return (
    <div className="tabbed">
    <Screen name="kit" title={say("web.feed.title")} header={<HeaderFeed place={say("web.feed.title")} step="" />}
      nav={<TabBar label={say("web.ui.navMain")} items={tabs} data-testid="kit-tabbar" />}>
      <div className="actions" data-testid="icons">
        {ICONS.map((name) => <Button key={name} icon={name} aria-label={name} type="button" />)}
      </div>
      <Info label={say("web.info")} data-testid="info">
        <p>{say("web.card.liked")}</p>
        <Button type="button" kind="text">{say("common.back")}</Button>
      </Info>
      <ul className="cards">
        <Card as="li"><Chip label={say("web.feed.title")} /><p>{say("web.card.liked")}</p>
          <LikeBurst count={liked ? 4 : 3} on={liked} data-testid="kit-burst" /></Card>
        <Card as="li"><p>{say("web.card.matched")}</p></Card>
      </ul>
      <Button type="button" kind="primary" icon="like" aria-label={say("web.card.like")} onClick={() => setLiked(true)} data-testid="kit-like" />

      <section data-testid="kit-links">
        <p>{say("web.card.liked")} <Link href="#kit-link-target" data-testid="kit-link">{say("web.legal.terms")}</Link>.</p>
        <p><Link href="https://example.org/" external block data-testid="kit-link-external">{say("web.legal.terms")}</Link></p>
        <LinkButton href="#kit-link-target" kind="primary" data-testid="kit-linkbutton">{say("web.info")}</LinkButton>
        <p id="kit-link-target" tabIndex={-1}>{say("web.card.matched")}</p>
      </section>
      <section data-testid="kit-actions">
        <Actions data-testid="kit-actions-row">
          <Button type="button" kind="text">{say("common.back")}</Button>
          <Button type="button" kind="secondary">{say("common.close")}</Button>
          <Button type="button" kind="primary">{say("chat.send")}</Button>
        </Actions>
      </section>

      {KINDS.map((kind) => (
        <section key={kind} data-testid={`kit-field-${kind}`}>
          <Field kind={kind} label={say("web.cabinet.name")} {...field(`k-${kind}`)} />
        </section>
      ))}
      <section data-testid="kit-field-filled"><Field label={say("web.cabinet.name")} hint={say("web.cabinet.termsEmpty")} {...field("filled-text")} /></section>
      <section data-testid="kit-field-error"><Field kind="email" label={say("web.cabinet.name")} error={say("web.cabinet.noShorteners")} {...field("error")} /></section>
      <section data-testid="kit-field-disabled"><Field label={say("web.cabinet.name")} disabled reason={reason} {...field("disabled")} /></section>
      <section data-testid="kit-field-busy"><Field label={say("web.cabinet.name")} busy {...field("busy")} /></section>
      <section data-testid="kit-fieldgroup">
        <FieldGroup legend={say("web.composer.conditions")}>
          <Field kind="decimal" label={say("web.cabinet.name")} {...field("group-1")} />
          <Field kind="decimal" label={say("web.composer.mode")} {...field("group-2")} />
        </FieldGroup>
      </section>

      <section data-testid="kit-pin">
        <form onSubmit={(event) => { event.preventDefault(); setSent(pin); }}>
          <PinField value={pin} onChange={setPin} />
          <PinField label={say("pin.again")} value={pinAgain} onChange={setPinAgain} error={say("pin.mismatch", { n: 3 })} />
          <Button type="submit" kind="primary">{say("chat.send")}</Button>
          <p data-testid="kit-pin-sent" className="ui-kit-sent">{sent}</p>
        </form>
      </section>
      <section data-testid="kit-pin-disabled"><PinField value="" onChange={() => undefined} disabled reason={reason} /></section>

      <section data-testid="kit-code"><CodeField value={code} onChange={setCode} /></section>
      <section data-testid="kit-code-pair"><CodeField groups={[2, 4]} value={codePair} onChange={setCodePair} /></section>
      <section data-testid="kit-code-error"><CodeField groups={[2, 4]} value={["A", ""]} onChange={() => undefined} error={say("restore.bad")} /></section>
      <section data-testid="kit-code-disabled"><CodeField value={["", "", "", ""]} onChange={() => undefined} disabled reason={reason} /></section>

      <section data-testid="kit-select">
        <Select label={say("web.theme.item")} options={LANG_OPTIONS} value={lang} onChange={setLang} />
      </section>
      <section data-testid="kit-select-error"><Select label={say("web.theme.item")} options={LANG_OPTIONS} value={lang} onChange={setLang} error={say("web.cabinet.noShorteners")} /></section>
      <section data-testid="kit-select-disabled"><Select label={say("web.theme.item")} options={LANG_OPTIONS} value={lang} onChange={setLang} disabled reason={reason} /></section>

      <section data-testid="kit-segments"><Segments label={modeLabel} options={mode} value={segment} onChange={setSegment} /></section>
      <section data-testid="kit-segments-disabled"><Segments label={modeLabel} options={mode} value="phrase" onChange={() => undefined} disabled reason={reason} /></section>
      <section data-testid="kit-choice">
        <Choice label={say("web.theme.item")} options={LANG_OPTIONS.map((o, i) => ({ ...o, sample: <span className={`ui-sample ui-sample-${(i % 4) + 1}`} aria-hidden="true" /> }))}
          value={choice} onChange={setChoice} />
      </section>

      <section data-testid="kit-range"><RangePair min={18} max={99} from={range.from} to={range.to} onChange={setRange} format={years} /></section>
      <section data-testid="kit-range-wrong"><RangePair min={18} max={99} from={wrongRange.from} to={wrongRange.to} onChange={setWrongRange} format={years} /></section>
      <section data-testid="kit-range-disabled"><RangePair min={18} max={99} from={30} to={50} onChange={() => undefined} format={years} disabled reason={reason} /></section>

      <section data-testid="kit-textarea"><Textarea label={say("web.composer.conditions")} maxLength={20} value={note} onChange={setNote} /></section>
      <section data-testid="kit-textarea-error"><Textarea label={say("web.composer.conditions")} value="" onChange={() => undefined} error={say("web.cabinet.noShorteners")} /></section>
      <section data-testid="kit-textarea-disabled"><Textarea label={say("web.composer.conditions")} value="" onChange={() => undefined} disabled reason={reason} /></section>

      <section data-testid="kit-checkbox"><Checkbox checked={agreed} onChange={setAgreed}>{consent}</Checkbox></section>
      <section data-testid="kit-checkbox-on"><Checkbox checked onChange={() => undefined}>{say("web.legal.accept_terms")}</Checkbox></section>
      <section data-testid="kit-checkbox-error"><Checkbox checked={false} onChange={() => undefined} error={say("web.legal.stale")}>{say("web.legal.accept_privacy")}</Checkbox></section>
      <section data-testid="kit-checkbox-disabled"><Checkbox checked={false} onChange={() => undefined} disabled reason={reason}>{say("web.legal.accept_guidelines")}</Checkbox></section>

      <section data-testid="kit-disclosure">
        <Disclosure summary={say("web.composer.scheme")}><p>{say("web.composer.hint")}</p></Disclosure>
        <Disclosure summary={say("web.composer.zone")} open><p>{say("web.card.matched")}</p></Disclosure>
      </section>

      <section data-testid="kit-message">
        <MessageInput label={say("web.chat.line")} sendLabel={say("chat.send")} onSend={(text) => setMessages((was) => [...was, text])} />
        <ul className="ui-kit-sent" data-testid="kit-message-sent">{messages.map((text, i) => <li key={i}>{text}</li>)}</ul>
      </section>
      <section data-testid="kit-message-disabled"><MessageInput label={say("web.chat.line")} sendLabel={say("chat.send")} onSend={() => undefined} disabled reason={reason} /></section>
      <section data-testid="kit-message-busy"><MessageInput label={say("web.chat.line")} sendLabel={say("chat.send")} onSend={() => undefined} busy /></section>

      <section data-testid="kit-sheet">
        <Button type="button" kind="secondary" onClick={() => setSheet(true)} data-testid="kit-sheet-open">{say("web.card.details")}</Button>
        <p data-testid="kit-sheet-picked" className="ui-kit-sent">{picked}</p>
        <ActionSheet open={sheet} title={say("web.card.details")} onClose={() => setSheet(false)} data-testid="kit-sheet-dialog"
          actions={[{ id: "block", label: say("web.card.block_yes"), danger: true, onSelect: () => setPicked("block") },
            { id: "complain", label: say("web.card.complain_send"), onSelect: () => setPicked("complain") }]} />
      </section>
      <section data-testid="kit-confirm">
        <Button type="button" kind="danger" onClick={() => setConfirm(true)} data-testid="kit-confirm-open">{say("web.game.resign")}</Button>
        <p data-testid="kit-confirm-count" className="ui-kit-sent">{confirmed}</p>
        <Confirm open={confirm} title={say("web.game.resign")} consequences={[say("web.chat.endAsk"), say("web.feed.tableFree", { n: 2 })]}
          confirmLabel={say("web.game.resign")} cancelLabel={say("web.card.cancel")} onConfirm={() => setConfirmed((n) => n + 1)} onClose={() => setConfirm(false)}
          data-testid="kit-confirm-dialog" />
      </section>

      <section data-testid="kit-status">
        {(["on", "connecting", "offline", "failed"] as StatusState[]).map((state) => <StatusHeader key={state} state={state} data-testid={`kit-status-${state}`} />)}
        <StatusHeader state={status} data-testid="kit-status-live" />
        <Button type="button" kind="secondary" onClick={() => setStatus(nextStatus[status])} data-testid="kit-status-next">{say("web.chat.send_again")}</Button>
      </section>
      <section data-testid="kit-dot">
        <InboxRow name={say("web.game.peer")} line={say("web.card.matched")} time={when} dot onOpen={() => undefined} />
        <InboxRow name={say("web.game.peer")} line={say("web.card.matched")} time={when} onOpen={() => undefined} />
        <div className="ui-kit-dot"><Dot data-testid="kit-dot-bare" /></div>
      </section>
      <section data-testid="kit-setting">
        <SettingRow label={say("web.theme.item")} value={say("web.theme.auto")} onSelect={() => setPicked("setting")} data-testid="kit-setting-plain" />
        <SettingRow label={say("web.game.resign")} danger onSelect={() => setPicked("danger")} data-testid="kit-setting-danger" />
      </section>
      <section data-testid="kit-list">
        <List label={say("web.inbox.offers")}>
          <ListItem action={{ label: say("liked.undo"), onSelect: () => setUndone((n) => n + 1) }}>{say("web.feed.blocked")}</ListItem>
          <ListItem>{say("web.feed.hidden")}</ListItem>
        </List>
        <p data-testid="kit-list-undone" className="ui-kit-sent">{undone}</p>
      </section>
      <section data-testid="kit-empty"><EmptyState title={say("web.feed.empty")} line={say("web.feed.empty_hint")} action={{ label: say("web.feed.newTable"), onSelect: () => undefined }} /></section>
      <section data-testid="kit-notice"><Notice>{say("web.offer.later")}</Notice></section>
      <section data-testid="kit-errorline">
        <ErrorLine>{say("web.cabinet.noShorteners")}</ErrorLine>
        <form data-testid="kit-errorform" onSubmit={(event) => { event.preventDefault(); focusFirstInvalid(event.currentTarget); }}>
          <Field label={say("web.cabinet.name")} {...field("ef-1")} />
          <Field label={say("web.composer.mode")} error={say("web.cabinet.noShorteners")} {...field("ef-2")} />
          <Button type="submit" kind="primary">{say("chat.send")}</Button>
        </form>
      </section>
      <section data-testid="kit-toast">
        <Button type="button" kind="secondary" onClick={() => setToast(say("web.card.complained"))} data-testid="kit-toast-open">{say("web.card.complain_send")}</Button>
        <Toast text={toast} onClose={() => setToast(null)} data-testid="kit-toast-slot" />
        <Button type="button" kind="secondary" onClick={() => setAutoToast(say("web.card.complained"))} data-testid="kit-toast-auto-open">{say("web.card.complain")}</Button>
        <Toast text={autoToast} onClose={() => setAutoToast(null)} autoCloseMs={1500} data-testid="kit-toast-auto-slot" />
      </section>
      <section data-testid="kit-copy"><Code value="KUBO-7741" data-testid="kit-copy-value" /></section>
      <section data-testid="kit-illustration">
        <Illustration viewBox="0 0 24 24" data-testid="kit-illustration-decor"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" /></Illustration>
        <Illustration viewBox="0 0 24 24" title={say("web.composer.scheme")} data-testid="kit-illustration-scheme"><rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" /></Illustration>
      </section>
      <ul className="cards" data-testid="kit-card-of">
        {entities.map(([of, key]) => <Card key={of} as="li" of={of}><Chip label={say(key)} tone="muted" outline /></Card>)}
        <Card as="li" kind="own" fading data-testid="kit-card-fading"><p>{say("web.feed.soon")}</p></Card>
      </ul>
    </Screen>
    </div>
  );
}
