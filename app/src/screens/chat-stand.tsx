// The stand's build only (VITE_STAND=1): the conversation pane drawn from a view of its own, the sheet's people and
// lines (w3_chat, w3_chat-over), so the measure (scripts/design/measure-app-w3.mjs) reads the geometry without a
// node's keys or socket. /stand/chat and /stand/chat-over; the real conversation is e2e's (chat paths).
import type { ChatView } from "@platform/chat/chat_state.ts";
import { ChatPane } from "./Chat";

// 21:01 … 21:05 in the stand's zone (the measure runs the browser in UTC).
const AT = Date.UTC(2026, 9, 18, 21, 0) / 1000;
const NOW = AT + 6 * 60;

export function standView(over: boolean): ChatView {
  const row = {
    kind: "chat" as const, id: "chat-stand", me: "me", key_epoch: 1, rekey_requested: false,
    peer: { key_epoch: 1, identity_id: "peer", identity_public_key: "pk" },
    name: "Nino", age: 27, state: over ? "ended" as const : "open" as const, chat_expires_at: NOW + 38 * 60, my_span: 60,
  };
  const lines = [
    { id: "1", text: "Hey! Saw your sign about the bakery.", mine: false, at: AT + 60 },
    { id: "2", text: "Yes! Is there one open after ten?", mine: true, at: AT + 120, state: "sent" as const },
    { id: "3", text: "The round oven on Leselidze. Best puri around.", mine: false, at: AT + 240 },
    { id: "4", text: "Perfect. Backgammon after?", mine: true, at: AT + 300, state: "sent" as const },
  ];
  return {
    row, lines: over ? lines.slice(0, 2) : lines, status: { key: "web.chat.connected" }, peerAway: false, peerAge: 27, missed: false,
    keysState: "open", keysError: null, over, blocked: false, error: null, span: 60, endsAt: NOW + 38 * 60,
    safety: null, busy: false, kept: { epoch: 1 }, gameOpen: false, gameBump: 0,
    starters: [{ position: 1, text: "Backgammon in the yard…", mode: "talk", liked_by: "them" }],
    askedByPeer: false, waitingForPeer: false,
  };
}

const none = () => {};
export function ChatStand({ over }: { over: boolean }) {
  return <ChatPane view={standView(over)} now={NOW} actions={{ onBack: none, onSend: async () => false, onResend: none, onMore: none, onSafety: none, onGame: none }} />;
}
