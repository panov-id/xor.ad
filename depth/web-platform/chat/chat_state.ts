// A conversation's state and actions without a screen (wave 3, 18.10.2026): the keys at each turn, the room's
// socket, one's own span and silence, end, block, reissue, the game toggle, the starters and the resend schedule.
// Moved out of web/src/screens/logic/useChat.ts so that the web and the app shell hold a chat the same way; the
// hook there and the app's screen only subscribe and draw. Behaviour unchanged. Words come from the face's own
// dictionary (deps.say): the state carries keys of it, and the two system lines it writes.

import type { Client } from "../../core/client.ts";
import { resendPause } from "../../core/resend.ts";
import { isPeerAway, missedSince, sawActivity } from "./away.ts";
import { blockByChat, endChat as closeForBoth, setSpan } from "./chat_actions.ts";
import type { ChatKeys, InboxChatRow } from "./keys.ts";
import { connectRoom, type RoomEvent } from "./room.ts";
import { endsAtOf, resetEnd, shiftEnd, spanOf, type Span } from "./span.ts";

export interface Line {
  id: string; text: string; mine: boolean; at: number; state?: "sent" | "queued" | "failed";
  // An extra like (§8.7): a card in the middle, not a bubble.
  extra?: { position: number; direction: "they_liked_yours" | "you_liked_theirs" };
  // A line the node wrote, not the other side (§8.2: the changed age; W14-AG).
  system?: boolean;
}

// A starter of the conversation (chat spec: "Liked, in order"; relay routes/inbox.ts, N1): who liked it is
// told from this reader's side.
export interface Starter { position: number; text: string; mode: string; liked_by: "me" | "them"; removed?: boolean }

// The status is a state — a key of the dictionary and its values, or an error's own text — and becomes words
// only when shown (W14): a check on it never compares a translated line.
export type Status = { key: string; values?: Record<string, string | number> } | { error: string };

export interface ChatView {
  row: InboxChatRow;
  lines: Line[];
  status: Status;
  peerAway: boolean;
  peerAge: number;
  missed: boolean;
  keysState: "opening" | "open" | "failed";
  keysError: string | null;
  over: boolean;
  blocked: boolean;
  error: string | null;
  span: Span;
  endsAt: number;
  safety: string | null;
  busy: boolean;
  kept: { epoch: number; refused?: string } | null;
  gameOpen: boolean;
  gameBump: number;
  starters: Starter[];
  askedByPeer: boolean;
  waitingForPeer: boolean;
}

export interface ChatDeps {
  client: Client;
  keys: ChatKeys;
  row: InboxChatRow;
  say: (key: string, values?: Record<string, string>) => string;
  /** The room; a test hands a stand-in (depth/web-platform/chat/room.ts by default). */
  connect?: (client: Client, chatId: string, on: (event: RoomEvent) => void) => { stop(): void };
  nowSeconds?: () => number;
}

type State = Omit<ChatView, "starters" | "askedByPeer" | "waitingForPeer"> & { extraStarters: Starter[] };

export class ChatSession {
  readonly #d: Required<ChatDeps>;
  #s: State;
  #view: ChatView;
  #turn = 0;
  #alive = true;
  #room: { stop(): void } | null = null;
  readonly #listeners = new Set<() => void>();
  readonly #resends = new Map<string, { text: string; tries: number; timer?: ReturnType<typeof setTimeout> }>();

  constructor(deps: ChatDeps) {
    this.#d = { connect: connectRoom, nowSeconds: () => Math.floor(Date.now() / 1000), ...deps };
    const given = deps.row;
    const span = spanOf(given.my_span);
    this.#s = {
      row: given, lines: [], status: { key: "web.chat.opening_keys" },
      // The other side stepped away (§8.2, W12-AW): a mark in the header while the field stays live; their
      // first line here takes it off. And what this tab did not see (§8.8): the row's last activity after the
      // newest moment this tab saw — said once on opening, taken off by what then arrives.
      peerAway: false, peerAge: given.age, missed: missedSince(given.id, given.last_activity_at),
      keysState: "opening", keysError: null, over: given.state === "ended", blocked: false, error: null,
      // One's own span and end (§8.6, W11-A): the row's my_span and chat_expires_at are the node's report — one's
      // own last message, or the chat's birth, plus one's own span; from there the page keeps the clock itself,
      // as depth/ink/rooms.ts does, and the node sends nothing while it runs.
      span, endsAt: endsAtOf(given.chat_expires_at, span, this.#d.nowSeconds()),
      safety: null, busy: false, kept: null,
      // The game in this conversation (GC3): shown on demand, read again on each board or proposal frame.
      gameOpen: false, gameBump: 0,
      // Starters that came as extra_like frames while this chat was open; the inbox row carries them too once
      // it is read again.
      extraStarters: [],
    };
    this.#view = this.#compose();
  }

  // ── the view a screen draws ──
  view(): ChatView { return this.#view; }
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #set(patch: Partial<State> | ((s: State) => Partial<State>)): void {
    if (!this.#alive) return;
    this.#s = { ...this.#s, ...(typeof patch === "function" ? patch(this.#s) : patch) };
    this.#view = this.#compose();
    for (const l of this.#listeners) l();
  }
  #compose(): ChatView {
    const { extraStarters, ...s } = this.#s;
    // The header's list, by position: the number is the one an extra like's card repeats, so it is the node's
    // position and nothing else.
    const givenStarters = (s.row as InboxChatRow & { starters?: Starter[] }).starters ?? [];
    const starters = [...givenStarters, ...extraStarters.filter((e) => !givenStarters.some((g) => g.position === e.position))]
      .sort((a, b) => a.position - b.position);
    return { ...s, starters, askedByPeer: s.row.rekey_requested, waitingForPeer: s.row.key_epoch > s.row.peer.key_epoch };
  }
  #overNow(key = "web.chat.over"): void { this.#set({ over: true, status: { key } }); }

  // ── life ──
  /** The keys, then the socket, once for the chat's life; frames open with whatever keys stand when they arrive. */
  start(): void {
    void this.#turnKeys();
    if (this.#s.over) return;
    this.#room = this.#d.connect(this.#d.client, this.#s.row.id, (event) => void this.#onRoom(event));
  }
  stop(): void {
    this.#alive = false;
    this.#room?.stop();
    for (const r of this.#resends.values()) clearTimeout(r.timer);
    this.#resends.clear();
    this.#listeners.clear();
  }
  /** One's own clock reaching zero is the same end the node's 4003 names, seen from here (§8.10: the term is one's own). */
  silenceLapsed(): void {
    if (!this.#s.over && this.#s.keysState === "open") this.#overNow();
  }

  // The row as the node reports it now — the epochs above all.
  async #refreshRow(): Promise<InboxChatRow | null> {
    const id = this.#s.row.id;
    const fresh = (await this.#d.client.inbox()).find((i) => i.kind === "chat" && i.id === id) as InboxChatRow | undefined;
    if (fresh) this.#set({ row: fresh });
    return fresh ?? null;
  }

  // The keys, at each turn: after the start, after a reissue asked or agreed. A later turn wins over an earlier one.
  async #turnKeys(): Promise<void> {
    const turn = ++this.#turn;
    const current = () => this.#alive && turn === this.#turn;
    this.#set({ keysState: "opening", keysError: null });
    const fresh = (await this.#refreshRow().catch(() => null)) ?? this.#s.row;
    try {
      await this.#d.keys.open(fresh);
      if (!current()) return;
      this.#set((s) => ({ keysState: "open", status: "key" in s.status && s.status.key === "web.chat.connected" ? s.status : { key: "web.chat.keys_ready" } }));
      const flushed = await this.#d.keys.flush(fresh);
      if (flushed.length > 0) {
        const at = Date.now() / 1000;
        this.#set((s) => ({ lines: [...s.lines, ...flushed.map((f) => ({ id: f.localId, text: f.text, mine: true, at, state: "sent" as const }))] }));
      }
      this.#set({ kept: this.#d.keys.keptOnNode(fresh.id) });
    } catch (e) {
      if (!current()) return;
      const message = (e as Error).message;
      this.#set({ keysState: "failed", keysError: message, status: { error: message } });
    }
  }

  async #onRoom(event: RoomEvent): Promise<void> {
    if (!this.#alive) return;
    const id = this.#s.row.id;
    switch (event.kind) {
      case "connected": this.#set({ status: { key: "web.chat.connected" } }); break;
      case "reconnecting": this.#set({ status: { key: "web.chat.reconnecting", values: { code: event.code, seconds: Math.round(event.inMs / 1000) } } }); break;
      case "over": this.#overNow(); break;
      case "moved": this.#set({ status: { key: "web.chat.moved" } }); break;
      case "update": this.#set({ status: { key: "web.chat.update" } }); break;
      case "failed": this.#set({ status: { key: "web.chat.failed", values: { message: event.message } } }); break;
      case "rekey":
        // The other side published a half at a new epoch: asked, or agreed to our request. Either way the row
        // has moved; read it and turn the keys.
        this.#set({ status: { key: "web.chat.rekeying", values: { epoch: event.epoch } } });
        void this.#turnKeys();
        break;
      case "extra_like": {
        // The same entity as a starter, arrived later (§8.7): a card with the number the header gives it, and
        // a row in the header.
        const liked_by = event.direction === "they_liked_yours" ? "them" : "me";
        const lineId = `extra-${event.position}`;
        this.#set((s) => ({
          extraStarters: s.extraStarters.some((x) => x.position === event.position) ? s.extraStarters
            : [...s.extraStarters, { position: event.position, text: event.text, mode: event.mode, liked_by }],
          lines: s.lines.some((l) => l.id === lineId) ? s.lines
            : [...s.lines, { id: lineId, text: event.text, mine: false, at: Date.now() / 1000, extra: { position: event.position, direction: event.direction } }],
        }));
        break;
      }
      case "sys": {
        if (isPeerAway(event.data)) { this.#set({ peerAway: true }); break; }
        // The other side changed their age (§8.2 :1449; W14-AG): one system line, the header follows. Only a
        // number the node sent is a number.
        const sys = event.data as { kind?: unknown; age?: unknown; type?: unknown } | null;
        if (sys?.kind === "age_changed") {
          if (typeof sys.age === "number" && Number.isFinite(sys.age)) {
            const age = sys.age;
            const text = this.#d.say("chat.ageChanged", { age: String(age) });
            this.#set((s) => ({ peerAge: age, lines: [...s.lines, { id: `age-${Date.now()}-${age}`, text, mine: false, at: Date.now() / 1000, system: true }] }));
          }
          break;
        }
        if (sys?.type === "board" || sys?.type === "proposal") {
          this.#set((s) => ({ gameBump: s.gameBump + 1, gameOpen: sys.type === "proposal" ? true : s.gameOpen }));
        }
        break;
      }
      case "message": {
        try {
          const opened = await this.#d.keys.read(this.#s.row, event.ciphertext, event.id);
          // Their line: the away mark comes off (§8.2), and this tab has now seen up to its moment — what
          // reaches the row's last activity is not missed any more.
          sawActivity(id, event.createdAt);
          this.#set((s) => ({
            lines: s.lines.some((l) => l.id === event.id) ? s.lines : [...s.lines, { id: event.id, text: opened, mine: false, at: event.createdAt }],
            peerAway: false,
            missed: missedSince(id, s.row.last_activity_at) ? s.missed : false,
          }));
          await this.#d.client.received(id, [event.id]);
        } catch (e) {
          const text = this.#d.say("web.chat.not_opened", { message: (e as Error).message });
          this.#set((s) => ({ lines: [...s.lines, { id: event.id, text, mine: false, at: event.createdAt, state: "failed" }] }));
        }
      }
    }
  }

  // ── actions ──
  // PATCH /chats/:id: what the node kept, not what was asked; and the end moves with it, from the same last own message.
  async changeSpan(next: Span): Promise<void> {
    this.#set({ busy: true, error: null });
    try {
      const kept = await setSpan(this.#d.client, this.#s.row.id, next);
      this.#set((s) => ({ endsAt: shiftEnd(s.endsAt, s.span, kept), span: kept }));
    } catch (e) {
      this.#set({ error: (e as Error).message });
    } finally {
      this.#set({ busy: false });
    }
  }

  // DELETE /chats/:id: the node closes it for both and sends 4003 to every room; no socket is needed to say so.
  async endChat(): Promise<void> {
    this.#set({ error: null });
    const done = await closeForBoth(this.#d.client, this.#s.row.id);
    if (!done.ok) return this.#set({ error: `${done.status}` });
    this.#overNow();
  }

  // POST /blocks {chat} (§8.9): mutual and final — the conversation closes for both, and the tombstone here
  // says it was a block, which only this side knows.
  async block(): Promise<void> {
    this.#set({ error: null });
    const done = await blockByChat(this.#d.client, this.#s.row.id);
    if (!done.ok) return this.#set({ error: `${done.status}` });
    this.#set({ blocked: true, over: true, status: { key: "web.chat.blocked" } });
  }

  setSafety(code: string | null): void { this.#set({ safety: code }); }
  setGameOpen(open: boolean): void { this.#set({ gameOpen: open }); }

  // My own delivered message is what resets my silence (§8.6), and the newest moment this tab saw (§8.8).
  #delivered(): void {
    const now = this.#d.nowSeconds();
    sawActivity(this.#s.row.id, now);
    this.#set((s) => ({ endsAt: resetEnd(s.span, now), missed: false }));
  }

  // A line the node answered `error` (202 not_stored, chats.ts) goes again with the same local_id on
  // resendPause's schedule — at once, 5, 15, 45, 135 s, then every ~10 min (chat spec :2388; W14-RS) — and
  // «отправить снова» sends it now, the count kept. Timers end with the session.
  #schedule(localId: string): void {
    const r = this.#resends.get(localId);
    if (!r || !this.#alive) return;
    clearTimeout(r.timer);
    r.timer = setTimeout(() => void this.resend(localId), resendPause(r.tries));
  }
  async resend(localId: string): Promise<void> {
    const r = this.#resends.get(localId);
    if (!r) return;
    clearTimeout(r.timer);
    try {
      const { answer } = await this.#d.keys.say(this.#s.row, r.text, localId);
      if (answer.status === 404) { this.#resends.delete(localId); this.#overNow(); return; }
      if (answer.status === 202 && answer.body.accepted) {
        this.#resends.delete(localId);
        this.#set((s) => ({ lines: s.lines.map((l) => (l.id === localId ? { ...l, state: "sent" as const } : l)) }));
        this.#delivered();
        return;
      }
    } catch {
      // Not stored again, or not reached: the schedule goes on.
    }
    r.tries += 1;
    this.#schedule(localId);
  }

  /** A line (typed or a sticker, chat/sticker.ts); true when it went out or waits in the resend schedule, so a
   * typed field may be cleared. */
  async send(line: string): Promise<boolean> {
    if (!line) return false;
    this.#set({ error: null });
    try {
      const { localId, answer } = await this.#d.keys.say(this.#s.row, line);
      if (answer.status === 404) { this.#overNow(); return false; }
      if (answer.status !== 202) throw new Error(this.#d.say("web.chat.not_sent", { status: String(answer.status), body: JSON.stringify(answer.body) }));
      const accepted = answer.body.accepted === true;
      this.#set((s) => ({ lines: [...s.lines, { id: localId, text: line, mine: true, at: Date.now() / 1000, state: accepted ? "sent" : "failed" }] }));
      if (accepted) this.#delivered();
      else {
        this.#resends.set(localId, { text: line, tries: 0 });
        this.#schedule(localId);
      }
      return true;
    } catch (e) {
      this.#set({ error: (e as Error).message });
      return false;
    }
  }

  async rekey(action: "ask" | "agree"): Promise<void> {
    this.#set({ busy: true, error: null });
    try {
      const fresh = (await this.#refreshRow()) ?? this.#s.row;
      const answer = action === "ask" ? await this.#d.keys.requestRekey(fresh) : await this.#d.keys.acceptRekey(fresh);
      if (answer.status !== 200) throw new Error(this.#d.say("web.chat.rekey_refused", { status: String(answer.status), body: JSON.stringify(answer.body) }));
      this.#set({ status: answer.body.state === "agreed" ? { key: "web.chat.rekey_agreed", values: { epoch: answer.body.epoch } } : { key: "web.chat.rekey_asked", values: { epoch: answer.body.epoch } } });
      void this.#turnKeys();
    } catch (e) {
      this.#set({ error: (e as Error).message });
    } finally {
      this.#set({ busy: false });
    }
  }
}
