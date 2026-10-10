// The conversation's handles (W11-A), as the terminal's row of actions in
// depth/ink/rooms.ts: one's own span — four values, the one set is chosen —
// the end by hand, the block that asks twice (§8.9: mutual and final), and
// the request for new keys, offered always, as the terminal offers it
// (rooms.ts «rekey»; the owner's decision of 01.10.2026) — shut while one's
// own request waits, turned into the agreement when the other side asked.
// Words are the terminal's dictionary where the line means the same there.
// Behind one «…» in an ActionSheet (owner, 10.10.2026: the screen as on the
// sheets — header, span, phrase, lines, field); the game and the safety code
// sit there too. Each action in words; the block, the loud one, last.
// Kit elements only (K5): Segments for the span, Confirm for the two asks.

import { useState } from "react";
import { SPANS, type Span } from "../chat/span.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Segments } from "../ui/Segments.tsx";
import { ActionSheet, Confirm, type SheetAction } from "../ui/Sheet.tsx";

export function ChatActions({ span, busy, askedByPeer, waitingForPeer, gameOpen, onSpan, onEnd, onBlock, onRekey, onGame, onSafety }: {
  span: Span;
  busy: boolean;
  askedByPeer: boolean;
  waitingForPeer: boolean;
  gameOpen: boolean;
  onSpan: (next: Span) => void;
  onEnd: () => void;
  onBlock: () => void;
  onRekey: (action: "ask") => void;
  onGame: () => void;
  onSafety: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [asking, setAsking] = useState<"end" | "block" | null>(null);
  const actions: SheetAction[] = [
    { id: "game", label: say(gameOpen ? "web.game.hide" : "web.game.title"), onSelect: onGame, testid: "game-toggle" },
    { id: "safety", label: say("chat.code"), onSelect: onSafety, testid: "show-safety" },
    // Asked by the other side, the agreement stands in its own card on the screen.
    ...(askedByPeer ? [] : [{ id: "rekey", label: say("web.chat.rekey_ask"), onSelect: () => onRekey("ask"), disabled: busy || waitingForPeer, testid: "rekey-ask" }]),
    { id: "end", label: say("chat.end"), onSelect: () => setAsking("end"), testid: "end" },
    { id: "block", label: say("block.item"), onSelect: () => setAsking("block"), danger: true, testid: "block" },
  ];
  return (
    <section data-testid="chat-actions">
      <Button type="button" icon="more" aria-label={say("web.chat.more")} aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(true)} data-testid="chat-more" />
      <ActionSheet open={menu} title={say("web.chat.more")} actions={actions} onClose={() => setMenu(false)} data-testid="chat-menu">
        <Segments
          label={say("web.chat.span_label")}
          value={String(span)}
          disabled={busy}
          testid="span"
          onChange={(next) => { if (Number(next) !== span) onSpan(Number(next) as Span); }}
          options={SPANS.map((s) => ({ value: String(s), label: say(`chat.spanLong${s}`), testid: `span-${s}` }))}
        />
      </ActionSheet>
      <Confirm
        open={asking === "end"}
        title={say("chat.end")}
        consequences={[say("web.chat.endAsk")]}
        confirmLabel={say("chat.end")}
        cancelLabel={say("common.back")}
        confirmTestId="end-yes"
        cancelTestId="end-no"
        onConfirm={onEnd}
        onClose={() => setAsking(null)}
        data-testid="end-confirm"
      />
      <Confirm
        open={asking === "block"}
        title={say("block.item")}
        consequences={[say("block.confirm"), say("block.what")]}
        confirmLabel={say("block.item")}
        cancelLabel={say("common.back")}
        confirmTestId="block-yes"
        cancelTestId="block-no"
        onConfirm={onBlock}
        onClose={() => setAsking(null)}
        data-testid="block-confirm"
      />
    </section>
  );
}
