// The conversation's handles (W11-A), as the terminal's row of actions in
// depth/ink/rooms.ts: one's own span — four values, the one set is pressed —
// the end by hand, the block that asks twice (§8.9: mutual and final), and
// the request for new keys, offered always, as the terminal offers it
// (rooms.ts «rekey»; the owner's decision of 01.10.2026) — shut while one's
// own request waits, turned into the agreement when the other side asked.
// Words are the terminal's dictionary where the line means the same there.

import { useState } from "react";
import { SPANS, type Span } from "../chat/span.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";

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
    <section className="chat-actions" data-testid="chat-actions">
      <p className="muted" id="chat-span-label">{say("web.chat.span_label")}</p>
      <div className="talk-sets" role="group" aria-labelledby="chat-span-label" data-testid="span" data-span={span}>
        {SPANS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            aria-pressed={s === span}
            className={s === span ? "talk-set talk-set-on" : "talk-set"}
            onClick={() => s !== span && onSpan(s)}
            data-testid={`span-${s}`}
          >
            {say(`chat.spanLong${s}`)}
          </button>
        ))}
      </div>
      {asking === "end" && (
        <section className="confirm" data-testid="end-confirm">
          <p>{say("web.chat.endAsk")}</p>
          <div className="ui-icon-row">
            <Button kind="danger" type="button" icon="end" aria-label={say("chat.end")} data-testid="end-yes" onClick={() => { setAsking(null); onEnd(); }} />
            <Button kind="secondary" type="button" icon="back" aria-label={say("common.back")} data-testid="end-no" onClick={() => setAsking(null)} />
          </div>
        </section>
      )}
      {asking === "block" && (
        <section className="confirm" data-testid="block-confirm">
          <p className="error">{say("block.confirm")}</p>
          <p>{say("block.what")}</p>
          <div className="ui-icon-row">
            <Button kind="danger" type="button" icon="block" aria-label={say("block.item")} data-testid="block-yes" onClick={() => { setAsking(null); onBlock(); }} />
            <Button kind="secondary" type="button" icon="back" aria-label={say("common.back")} data-testid="block-no" onClick={() => setAsking(null)} />
          </div>
        </section>
      )}
      {asking === null && (
        <div className="ui-icon-row">
          <Button type="button" icon="end" aria-label={say("chat.end")} data-testid="end" onClick={() => setAsking("end")} />
          <Button type="button" icon="block" aria-label={say("block.item")} data-testid="block" onClick={() => setAsking("block")} />
          {/* Asked by the other side, the agreement stands in its own card above. */}
          {!askedByPeer && (
            <Button type="button" icon="key" aria-label={say("web.chat.rekey_ask")} disabled={busy || waitingForPeer} onClick={() => onRekey("ask")} data-testid="rekey-ask" />
          )}
        </div>
      )}
    </section>
  );
}
