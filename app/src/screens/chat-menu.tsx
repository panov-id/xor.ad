// The conversation's «…» (prototype ids chat-more, chat-fade, chat-end-confirm): a bottom sheet of six tiles, three
// over three (fade, game, safety code / new keys, end, block; the last two on the danger ground). The fade tile opens
// the span's four choices in the same sheet (chat-fade); end and block ask once more on a screen of their own
// (chat-end-confirm: the hero, the words, cancel and confirm at the foot), as the web's ChatActions did in the sheet.
// The web's testids: chat-actions, chat-menu, span, span-10/30/60/260, game-toggle, show-safety, rekey-ask, end,
// block, end-confirm, block-confirm; new ones: menu-close, menu-cancel, menu-back.
import { createContext, type ReactNode, useState } from "react";
import { SPANS, type Span } from "@platform/chat/span.ts";
import { label, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { spanWord } from "./chat-logic";

export type MenuStep = "menu" | "span" | "end" | "block";

export interface MenuActions {
  onClose: () => void;
  onSpan: (span: Span) => void;
  onGame: () => void;
  onSafety: () => void;
  onRekey: () => void;
  onEnd: () => void;
  onBlock: () => void;
}

/** What the conversation lends to the screens that open over it (the game's, chat-game.tsx): the element they are
 * drawn into (inside the conversation's own frame) and its bar (back, the person, the ring, «…»). Lives here, which
 * both files import. */
export interface OverlayHost { el: HTMLElement | null; bar: (onBack: () => void, backLabel: string, own: boolean) => ReactNode }
export const OverlayCtx = createContext<OverlayHost | null>(null);

function Pick({ icon, c, text, danger, testid, onOpen, disabled }:
  { icon: string; c: 1 | 2 | 3 | 4 | 5 | 6; text: string; danger?: boolean; testid: string; onOpen: () => void; disabled?: boolean }) {
  return (
    <li>
      <button type="button" className="k-pick" data-danger={danger ? "" : undefined} disabled={disabled} onClick={onOpen} data-testid={testid}>
        <span className="k-badge" data-c={c} aria-hidden="true"><NdIcon name={icon} /></span><span>{text}</span>
      </button>
    </li>
  );
}

export function ChatMenu({ span, busy, waitingForPeer, initial = "menu", actions }:
  { span: Span; busy: boolean; waitingForPeer: boolean; initial?: MenuStep; actions: MenuActions }) {
  const [step, setStep] = useState<MenuStep>(initial);
  const confirming = step === "end" || step === "block";
  return (
    <div className="k-chm" data-testid="chat-actions" data-step={step}>
      {!confirming && <button type="button" className="k-chm-dim" aria-label={say("common.back")} onClick={actions.onClose} data-testid="menu-close" />}
      {step === "menu" && (
        <section className="layer-sheet k-chm-sheet" role="dialog" aria-modal="true" aria-labelledby="chm-title" data-testid="chat-menu">
          <h2 className="k-sheet-title" id="chm-title">{label("app.chat.menu_title")}</h2>
          <ul className="k-picks">
            <Pick icon="clock" c={5} text={say("app.chat.fade_after")} testid="span" onOpen={() => setStep("span")} />
            <Pick icon="g-chess" c={1} text={say("app.chat.game")} testid="game-toggle" onOpen={actions.onGame} />
            <Pick icon="shield" c={5} text={say("app.chat.safety")} testid="show-safety" onOpen={actions.onSafety} />
            <Pick icon="keys" c={3} text={say("app.chat.new_keys")} testid="rekey-ask" onOpen={actions.onRekey} disabled={busy || waitingForPeer} />
            <Pick icon="close" c={1} text={say("app.chat.end")} danger testid="end" onOpen={() => setStep("end")} />
            <Pick icon="block" c={5} text={say("app.chat.block")} danger testid="block" onOpen={() => setStep("block")} />
          </ul>
        </section>
      )}
      {step === "span" && (
        <section className="layer-sheet k-chm-sheet" role="dialog" aria-modal="true" aria-labelledby="chm-title" data-testid="chat-menu">
          <h2 className="k-sheet-title" id="chm-title">{label("app.chat.fade_after")}</h2>
          <ul className="k-picks" data-cols="4" role="radiogroup" aria-labelledby="chm-title">
            {SPANS.map((s) => {
              const w = spanWord(s);
              return (
                <li key={s}>
                  <button type="button" role="radio" aria-checked={s === span} className="k-pick" disabled={busy}
                    onClick={() => { actions.onSpan(s); setStep("menu"); }} data-testid={`span-${s}`}>
                    <span className="k-badge" data-c="5" aria-hidden="true"><NdIcon name="clock" /></span><span>{say(w.key, w.values)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="k-note k-chm-note" role="status"><NdIcon name="fade" /><p>{say("app.chat.span_lead")}</p></div>
        </section>
      )}
      {confirming && (
        <main className="k-screen k-chm-screen" data-screen={`chat-${step}-confirm`} role="dialog" aria-modal="true" aria-labelledby="chm-title">
          <div className="k-col">
            <header className="k-row k-bar">
              <button type="button" className="k-bar-btn" aria-label={say("common.back")} onClick={() => setStep("menu")} data-testid="menu-back"><NdIcon name="back" /></button>
              <h1 className="k-bar-title">{say(step === "end" ? "app.chat.end" : "app.chat.block")}</h1>
            </header>
            <section className="k-panel k-grow k-tk-empty">
              <span className="k-tk-hero" data-tone="1" aria-hidden="true"><NdIcon name="close" /></span>
              <h2 id="chm-title">{label(step === "end" ? "app.chat.end_ask" : "app.chat.block_ask")}</h2>
              <p>{say(step === "end" ? "app.chat.end_lead" : "app.chat.block_lead")}</p>
            </section>
            <section className="k-panel k-actions">
              <div className="k-row">
                <button type="button" className="k-cta" data-outline="" data-fit="" onClick={() => setStep("menu")} data-testid="menu-cancel"><NdIcon name="close" /><span>{say("app.chat.cancel")}</span></button>
                <button type="button" className="k-cta" data-outline="" data-strong="" data-fit="" disabled={busy} onClick={step === "end" ? actions.onEnd : actions.onBlock} data-testid={`${step}-confirm`}>
                  <NdIcon name="close" /><span>{say(step === "end" ? "app.chat.end" : "app.chat.block")}</span>
                </button>
              </div>
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
