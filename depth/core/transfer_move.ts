// `depth move` over the node's five transfer routes (relay/node/src/routes/
// transfer.ts; chat spec §8.2, screen 13): the old device opens a window and
// shows nine characters, the new one types them and leaves its envelope, the
// old one shows who asked and the four check characters, and only "it is me"
// moves anything. Both sides learn what happened from GET /sessions/:lookup_id
// — there are no sockets for it (§8.1), and a second claim would cancel the
// transfer, so the claim route cannot be polled.
//
// The client is described by what this file uses of it — the seat, the held
// long key and the request, written in depth/core/client.ts with the restore
// (B1) — so a test can stand a fake in for it where no node is needed.

import type { Answer, HeldLongKey } from "./client.ts";
import type { SigningKey } from "./sign.ts";
import { bornWithHandover, newWrapPair } from "./client.ts";
import { fromBase64url } from "./seal.ts";
import { base64url } from "./sign.ts";
import {
  checkCharacters, type Claimant, deriveTransferCode, newTransferCode, openClaim, openReply, sealClaim,
  sealReply, type TransferKeys, transferGroups,
} from "./transfer.ts";

export interface MoveClient {
  identityId: string;
  readonly held: HeldLongKey | null;
  readonly longSpki: string;
  request<T>(method: string, path: string, body?: unknown, signed?: boolean, signal?: AbortSignal): Promise<Answer<T>>;
  seat(s: {
    identityId: string; sessionId: string; sessionKey: SigningKey; longKey: CryptoKey; longSpki: string;
    wrapPrivate: CryptoKey; held?: HeldLongKey;
  }): void;
  firstPin(pin: string): Promise<Answer>;
  // The long key under the paper code, from the ack (R3): without it a moved
  // identity cannot reissue its code on the new device (finding T1).
  holdWrappedLongKey?(wrapped: Uint8Array): void;
}

// What GET /sessions/:lookup_id can say, plus the one word only a client can:
// a claim whose envelope does not open with this code is not somebody who
// typed it right, and nobody is asked about it (§8.2).
export type MoveState = "waiting" | "claimed" | "approved" | "rejected" | "cancelled" | "expired" | "garbled";

interface StateBody {
  state?: string;
  claim_envelope?: string;
  reply_envelope?: string;
  session_id?: string;
}

const path = (keys: TransferKeys, tail = "") => `/sessions/${encodeURIComponent(keys.lookupId)}${tail}`;

// How long one ask of the state may take before it counts as "no answer yet".
// The move's outcome is decided on the node and kept there: an ask lost to a
// slow network or a dropped connection is asked again, and never ends a move
// on a screen that would then say something the node does not (review panel
// 2026-09-26, F1/F2).
export const ASK_TIMEOUT_MS = 15_000;

// One call, given timeoutMs: its answer, or null for "none came". The call
// is aborted when the time is up, so a hung request is not left open behind
// the next one (review panel 2 2026-09-26, G12); the race stands as well, for
// a client that does not listen to the signal.
async function within<T>(
  timeoutMs: number,
  call: (signal: AbortSignal) => Promise<Answer<T>>,
): Promise<Answer<T> | null> {
  const stop = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((done) => (timer = setTimeout(() => {
    stop.abort();
    done(null);
  }, timeoutMs)));
  try {
    return await Promise.race([call(stop.signal), late]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The state, asked once: its answer, or null for "none came — ask later".
// A 429 carries the node's own "later" (Retry-After, seconds); the caller
// keeps quiet until then instead of spending its next asks on refusals
// (F16).
function askState(client: MoveClient, keys: TransferKeys, timeoutMs: number): Promise<Answer<StateBody> | null> {
  return within(timeoutMs, (signal) => client.request<StateBody>("GET", path(keys), undefined, false, signal));
}

// The ack is tried this many times, this far apart: a lost one leaves the
// reply on the node until the sweep, which counts it as a move nobody
// finished (relay_transfer_total{result="reply_unacknowledged"}) — G15. A
// repeat is 200 on the node (transfer.ts ackReply), so trying again is safe.
export const ACK_TRIES = 3;
export const ACK_PAUSE_MS = 5_000;

function known(state: string | undefined): MoveState {
  return state === "waiting" || state === "claimed" || state === "approved" || state === "rejected" ||
      state === "cancelled" || state === "expired"
    ? state
    : "expired";
}

// The device the identity is leaving.
export class Departure {
  last: MoveState = "waiting";
  claimant: Claimant | null = null;
  check = "";
  // When the request was seen, for "когда" on the screen: the node does not
  // say, and a time from the other device would be its word, not a fact.
  seenAt = 0;

  private constructor(
    private readonly client: MoveClient,
    private readonly keys: TransferKeys,
    readonly code: string,
    readonly expiresIn: number,
  ) {}

  get groups(): string[] {
    return transferGroups(this.code);
  }

  // POST /sessions/invite — signed, and with the PIN's proof (§8.2,
  // 2026-09-11). A refusal comes back as the node's answer: a wrong PIN is
  // 409 pin_mismatch with attempts_left, and the screen says so.
  static async open(client: MoveClient, pinAuth: Uint8Array, code = newTransferCode()): Promise<Departure | Answer> {
    if (!client.held) throw new Error("this device does not hold the long key it would have to hand over");
    const keys = await deriveTransferCode(code);
    const answer = await client.request<{ expires_in: number }>("POST", "/sessions/invite", {
      lookup_id: keys.lookupId,
      auth: base64url(pinAuth),
    });
    if (answer.status !== 200) return answer;
    return new Departure(client, keys, code, answer.body.expires_in);
  }

  // Until when the node asked to be left alone (Retry-After), in ms.
  quietUntil = 0;

  async state(timeoutMs = ASK_TIMEOUT_MS): Promise<MoveState> {
    // Moved is moved: the node froze this device in the approval, and asking
    // again could only turn that into something else on the screen.
    if (this.last === "approved" || Date.now() < this.quietUntil) return this.last;
    const answer = await askState(this.client, this.keys, timeoutMs);
    if (!answer) return this.last;
    if (answer.status === 404) return "expired";
    // The state route has its own allowance per address (TRANSFER_STATE_LIMITS
    // on the node, 600 an hour); a 429 is "ask later", not an end, so the last
    // word stands until the time the node named.
    if (answer.status === 429) {
      this.quietUntil = Date.now() + (answer.retryAfter ?? 5) * 1000;
      return this.last;
    }
    if (answer.status !== 200) throw new Error(`the transfer state was not given: ${answer.status}`);
    const state = this.last = known(answer.body.state);
    if (state === "claimed" && !this.claimant && answer.body.claim_envelope) {
      try {
        this.claimant = await openClaim(this.keys, answer.body.claim_envelope);
      } catch {
        return "garbled";
      }
      this.check = await checkCharacters(this.claimant);
      this.seenAt = Date.now();
    }
    return state;
  }

  // "It is me": the long key sealed to the device that claimed, and the node
  // freezes this one in the same transaction (transfer.ts approveInvite).
  async approve(): Promise<Answer<{ state?: string; session_id?: string }>> {
    if (!this.claimant) throw new Error("nobody has claimed this code yet");
    if (!this.client.held) throw new Error("this device does not hold the long key");
    const reply = await sealReply(
      this.keys, this.claimant, { identityId: this.client.identityId, longPub: this.client.longSpki }, this.client.held,
    );
    const answer = await this.client.request<{ state?: string; session_id?: string }>("POST", path(this.keys, "/approve"), {
      reply,
      sign_pub: this.claimant.sign_pub,
      wrap_pub: this.claimant.wrap_pub,
      ...(this.claimant.unlock_pub ? { unlock_pub: this.claimant.unlock_pub } : {}),
      label: this.claimant.label,
    });
    if (answer.status === 200) this.last = "approved";
    return answer;
  }

  // "It does not match": the code dies, nothing moves.
  async reject(): Promise<Answer> {
    return await this.client.request("POST", path(this.keys, "/reject"));
  }
}

// The device the identity is arriving at.
export class Arrival {
  last: MoveState = "claimed";

  private constructor(
    private readonly client: MoveClient,
    private readonly keys: TransferKeys,
    private readonly mine: Claimant,
    private readonly sessionKey: SigningKey,
    private readonly wrapPrivate: CryptoKey,
    readonly check: string,
  ) {}

  // POST /sessions/claim — unsigned: this device has no session, and the code
  // is what authorises it. A 404 is "the code does not match or has expired",
  // one wording for both, and a 409 is the second claim that cancelled it.
  // A face with a disk (the web, T1) takes the session key's and the
  // wrapping pair's pkcs8 once, to seal them, and names its unlock key — as a
  // raise by the paper code does (recovery.ts raise); the terminal takes none.
  static async claim(
    client: MoveClient,
    code: string,
    label: string,
    opts: { unlockPub?: string; holdSession?: (pkcs8: Uint8Array) => Promise<void>; holdWrap?: (pkcs8: Uint8Array) => Promise<void> } = {},
  ): Promise<Arrival | Answer> {
    const keys = await deriveTransferCode(code);
    const pair = await bornWithHandover({ name: "ECDSA", namedCurve: "P-256" }, ["sign", "verify"], opts.holdSession);
    const sessionKey: SigningKey = {
      privateKey: pair.privateKey,
      publicSpki: base64url(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey))),
    };
    const wrap = await newWrapPair(opts.holdWrap);
    const mine: Claimant = {
      sign_pub: sessionKey.publicSpki,
      wrap_pub: base64url(new Uint8Array(await crypto.subtle.exportKey("spki", wrap.publicKey))),
      label,
      ...(opts.unlockPub ? { unlock_pub: opts.unlockPub } : {}),
    };
    const answer = await client.request("POST", "/sessions/claim", {
      lookup_id: keys.lookupId,
      envelope: await sealClaim(keys, mine),
    }, false);
    if (answer.status !== 200) return answer;
    return new Arrival(client, keys, mine, sessionKey, wrap.privateKey, await checkCharacters(mine));
  }

  // Asked until the old device decides. On "approved" the long key is opened,
  // checked against the public half the reply names, and the client is seated
  // in the new session; the first PIN is the caller's next step (§8.2: the
  // arriving device has none, and the node left it a one-time grant).
  // Until when the node asked to be left alone (Retry-After), in ms.
  quietUntil = 0;
  // Seated in the new session: from here the move has happened on this
  // device, whatever a later ask or the ack says (F1).
  seated = false;

  async state(timeoutMs = ASK_TIMEOUT_MS): Promise<MoveState> {
    if (this.seated) return "approved";
    if (Date.now() < this.quietUntil) return this.last;
    const answer = await askState(this.client, this.keys, timeoutMs);
    if (!answer) return this.last;
    if (answer.status === 404) return "expired";
    if (answer.status === 429) {
      this.quietUntil = Date.now() + (answer.retryAfter ?? 5) * 1000;
      return this.last;
    }
    if (answer.status !== 200) throw new Error(`the transfer state was not given: ${answer.status}`);
    const state = this.last = known(answer.body.state);
    if (state !== "approved") return state;
    if (!answer.body.reply_envelope || !answer.body.session_id) throw new Error("approved without a reply");
    const got = await openReply(this.keys, this.mine, this.wrapPrivate, answer.body.reply_envelope);
    this.client.seat({
      identityId: got.identityId,
      sessionId: answer.body.session_id,
      sessionKey: this.sessionKey,
      longKey: got.signing,
      longSpki: got.longPub,
      wrapPrivate: this.wrapPrivate,
      held: got.long,
    });
    this.seated = true;
    // The reply is kept until it is taken, so an ask lost on the way can be
    // asked again; taken, it goes (POST /sessions/:lookup_id/ack, signed by
    // the session just seated — B3). A refused or lost ack does not undo the
    // move: the envelope waits for the sweeper, sealed to this device's
    // wrapping key and useless to anybody else — so it is not this call's to
    // fail (F1), nor to wait for: the ack goes on its own, and the arrival is
    // said at once (G11).
    this.ackDone = this.ack(timeoutMs);
    return state;
  }

  // Tried until the node answers something other than "not now": no answer,
  // a 429 and a 5xx are asked again after a pause; a 200 is taken, and any
  // other refusal will not change by asking.
  private async ack(timeoutMs: number): Promise<number> {
    for (let n = 1; ; n++) {
      const answer = await within(timeoutMs, (signal) =>
        this.client.request<{ recovery_wrapped_key?: string }>("POST", path(this.keys, "/ack"), undefined, true, signal)
      );
      this.acked = answer?.status ?? 0;
      const wrapped = answer?.status === 200 ? answer.body?.recovery_wrapped_key : undefined;
      if (typeof wrapped === "string" && this.client.holdWrappedLongKey) this.client.holdWrappedLongKey(fromBase64url(wrapped));
      const again = this.acked === 0 || this.acked === 429 || this.acked >= 500;
      if (!again || n >= ACK_TRIES) return this.acked;
      await new Promise((done) => setTimeout(done, this.ackPauseMs));
    }
  }

  // What the node said to the last ack, and the tries' end — for the tests
  // and nothing else; ackPauseMs is theirs to shorten.
  acked = 0;
  ackDone: Promise<number> = Promise.resolve(0);
  ackPauseMs = ACK_PAUSE_MS;
}
