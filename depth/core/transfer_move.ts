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
import { base64url, generateSigningKey } from "./sign.ts";
import {
  checkCharacters, type Claimant, deriveTransferCode, newTransferCode, openClaim, openReply, sealClaim,
  sealReply, type TransferKeys, transferGroups,
} from "./transfer.ts";

export interface MoveClient {
  identityId: string;
  readonly held: HeldLongKey | null;
  readonly longSpki: string;
  request<T>(method: string, path: string, body?: unknown, signed?: boolean): Promise<Answer<T>>;
  seat(s: {
    identityId: string; sessionId: string; sessionKey: SigningKey; longKey: CryptoKey; longSpki: string;
    wrapPrivate: CryptoKey; held?: HeldLongKey;
  }): void;
  firstPin(pin: string): Promise<Answer>;
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

  async state(): Promise<MoveState> {
    const answer = await this.client.request<StateBody>("GET", path(this.keys), undefined, false);
    if (answer.status === 404) return "expired";
    // The state route shares the claim's allowance of the address (60 an hour,
    // TRANSFER_CLAIM_LIMITS), and two devices at home are one address: a 429
    // is "ask later", not an end, so the last word stands until then.
    if (answer.status === 429) return this.last;
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
    return await this.client.request("POST", path(this.keys, "/approve"), {
      reply,
      sign_pub: this.claimant.sign_pub,
      wrap_pub: this.claimant.wrap_pub,
      label: this.claimant.label,
    });
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
  static async claim(client: MoveClient, code: string, label: string): Promise<Arrival | Answer> {
    const keys = await deriveTransferCode(code);
    const sessionKey = await generateSigningKey();
    const wrap = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
    const mine: Claimant = {
      sign_pub: sessionKey.publicSpki,
      wrap_pub: base64url(new Uint8Array(await crypto.subtle.exportKey("spki", wrap.publicKey))),
      label,
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
  async state(): Promise<MoveState> {
    const answer = await this.client.request<StateBody>("GET", path(this.keys), undefined, false);
    if (answer.status === 404) return "expired";
    if (answer.status === 429) return this.last;
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
    // The reply is kept until it is taken, so an ask lost on the way can be
    // asked again; taken, it goes (POST /sessions/:lookup_id/ack, signed by
    // the session just seated — B3). A refused ack does not undo the move:
    // the envelope waits for the sweeper, sealed to this device's wrapping
    // key and useless to anybody else.
    this.acked = (await this.client.request("POST", path(this.keys, "/ack"))).status;
    return state;
  }

  // What the node said to the ack, for the tests and nothing else.
  acked = 0;
}
