// The conversation's «…» (sosed Dusk: w3_chat-more): a sheet over the dimmed chat, the talk's everyday rows first —
// fade after (one's own span), the game, the safety code, new keys — then the two that end it, apart and in coral.
// End and block ask once more in the same sheet (web ChatActions: Confirm), the span opens its four choices there too.
// The web's testids: chat-actions, chat-menu, span, span-10/30/60/260, game-toggle, show-safety, rekey-ask, end,
// block, end-confirm, block-confirm; new ones: menu-close, menu-cancel.
import { useState } from "react";
import { SPANS, type Span } from "@platform/chat/span.ts";
import { label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { chevronRight, clock, close, die, key, leave, shield } from "../shell/icons";
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

function Row({ icon, text, value, danger, testid, onOpen, disabled }:
  { icon: string; text: string; value?: string; danger?: boolean; testid: string; onOpen: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={danger ? "chm-row chm-danger" : "chm-row"} onClick={onOpen} disabled={disabled} data-testid={testid}>
      <span className="chm-icon" aria-hidden="true"><Icon d={icon} /></span>
      <span className="chm-text">{text}</span>
      {value && <span className="chm-value">{value}</span>}
      <Icon d={chevronRight} className="chm-chev" />
    </button>
  );
}

export function ChatMenu({ span, busy, waitingForPeer, initial = "menu", actions }:
  { span: Span; busy: boolean; waitingForPeer: boolean; initial?: MenuStep; actions: MenuActions }) {
  const [step, setStep] = useState<MenuStep>(initial);
  const word = spanWord(span);
  return (
    <div className="chm" data-testid="chat-actions" data-step={step}>
      <button type="button" className="chm-shade" aria-label={say("common.back")} onClick={actions.onClose} data-testid="menu-close" />
      <section className="chm-sheet" role="dialog" aria-modal="true" aria-labelledby="chm-title" data-testid="chat-menu">
        <span className="chm-grab" aria-hidden="true" />
        {step === "menu" && (
          <>
            <h2 id="chm-title">{label("app.chat.menu_title")}</h2>
            <div className="chm-rows">
              <Row icon={clock} text={say("app.chat.fade_after")} value={say(word.key, word.values)} testid="span" onOpen={() => setStep("span")} />
              <Row icon={die} text={say("app.chat.game")} testid="game-toggle" onOpen={actions.onGame} />
              <Row icon={shield} text={say("app.chat.safety")} testid="show-safety" onOpen={actions.onSafety} />
              <Row icon={key} text={say("app.chat.new_keys")} testid="rekey-ask" onOpen={actions.onRekey} disabled={busy || waitingForPeer} />
              <Row icon={leave} text={say("app.chat.end")} danger testid="end" onOpen={() => setStep("end")} />
              <Row icon={close} text={say("app.chat.block")} danger testid="block" onOpen={() => setStep("block")} />
            </div>
          </>
        )}
        {step === "span" && (
          <>
            <h2 id="chm-title">{label("app.chat.fade_after")}</h2>
            <p className="chm-lead">{say("app.chat.span_lead")}</p>
            <div className="chm-spans" role="radiogroup" aria-labelledby="chm-title">
              {SPANS.map((s) => {
                const w = spanWord(s);
                return (
                  <button key={s} type="button" role="radio" aria-checked={s === span} className="chm-span" disabled={busy}
                    onClick={() => { actions.onSpan(s); setStep("menu"); }} data-testid={`span-${s}`}>
                    {say(w.key, w.values)}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {(step === "end" || step === "block") && (
          <>
            <h2 id="chm-title">{label(step === "end" ? "app.chat.end_ask" : "app.chat.block_ask")}</h2>
            <p className="chm-lead">{say(step === "end" ? "app.chat.end_lead" : "app.chat.block_lead")}</p>
            <div className="chm-confirm">
              <button type="button" className="chm-go" disabled={busy} onClick={step === "end" ? actions.onEnd : actions.onBlock} data-testid={`${step}-confirm`}>
                {say(step === "end" ? "app.chat.end" : "app.chat.block")}
              </button>
              <button type="button" className="chm-cancel" onClick={() => setStep("menu")} data-testid="menu-cancel">{say("app.chat.cancel")}</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
