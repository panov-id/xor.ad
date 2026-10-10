// The conversation's handles (W11-A), as the terminal's row of actions in
// depth/ink/rooms.ts: one's own span — four values, the one set is chosen —
// the end by hand, the block that asks twice (§8.9: mutual and final), and
// the request for new keys, offered always, as the terminal offers it
// (rooms.ts «rekey»; the owner's decision of 01.10.2026) — shut while one's
// own request waits, turned into the agreement when the other side asked.
// Words are the terminal's dictionary where the line means the same there.
// Kit elements only (K5): Segments for the span, Confirm for the two asks.

import { useState } from "react";
import { SPANS, type Span } from "../chat/span.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Actions } from "../ui/Links.tsx";
import { Segments } from "../ui/Segments.tsx";
import { Confirm } from "../ui/Sheet.tsx";

export function ChatActions({ span, busy, askedByPeer, waitingForPeer, onSpan, onEnd, onBlock, onRekey }: {
  span: Span;
  busy: boolean;
  askedByPeer: boolean;
  waitingForPeer: boolean;
  onSpan: (next: Span) => void;
  onEnd: () => void;
  onBlock: () => void;
  onRekey: (action: "ask") => void;
}) {
  const [asking, setAsking] = useState<"end" | "block" | null>(null);
  return (
    <section data-testid="chat-actions">
      <Segments
        label={say("web.chat.span_label")}
        value={String(span)}
        disabled={busy}
        testid="span"
        onChange={(next) => { if (Number(next) !== span) onSpan(Number(next) as Span); }}
        options={SPANS.map((s) => ({ value: String(s), label: say(`chat.spanLong${s}`), testid: `span-${s}` }))}
      />
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
      <Actions>
        <Button type="button" icon="end" aria-label={say("chat.end")} data-testid="end" onClick={() => setAsking("end")} />
        <Button type="button" icon="block" aria-label={say("block.item")} data-testid="block" onClick={() => setAsking("block")} />
        {/* Asked by the other side, the agreement stands in its own card above. */}
        {!askedByPeer && (
          <Button type="button" icon="key" aria-label={say("web.chat.rekey_ask")} disabled={busy || waitingForPeer} onClick={() => onRekey("ask")} data-testid="rekey-ask" />
        )}
      </Actions>
    </section>
  );
}
