# Crypto attack review, 2 November 2026

Pair: `crypto-attack-2026-11-02_RU.md`. Test: `depth/core/seal_attack.test.ts`, 8 of 8 pass. Two deliberate breaks of `depth/core/seal.ts` turned it red (a zero nonce used for encryption: 3 failed; a constant written nonce: 2 failed), then the code was restored.
The audit part was made by reading the code, nothing was run against a live service. Its author is an agent; the lines marked "checked" were read again by the session.

## Main finding (important): a device copy plus a database dump gives the PIN offline

1. The attacker holds both the device's storage and a dump of the node's database.
2. The device holds `deviceSalt`. The node holds `auth_hash = sha256(Argon2id(PIN, deviceSalt)[0..32])` (checked: `relay/node/src/routes/identity.ts:808`, Argon2id 64 MiB, t=3, p=1 in `depth/core/pin.ts:17-19`).
3. There are 10^6 PINs. Assumed speed, not measured: about 2000 guesses a second on one 24 GB GPU gives about 8 minutes; 160 a second on 16 CPU cores gives about 1.7 hours.
4. With the PIN known, one signed `POST /vault/share` from the copied unlock key returns the share. The node counts a normal success and the owner sees nothing.
5. If the dump also holds `VAULT_SHARE_KEY`, step 4 needs no live call and the finding is critical.

Fixed 02.11: `auth_hash` is stored under an HMAC with a key from `VAULT_SHARE_KEY` (`relay/node/src/lib/vault_share.ts`), the node converts old rows at start; a dump alone no longer tests a guess. The steps above describe the state before the fix, the case of a key in the dump (step 5) stands. `recovery_auth_hash` is unchanged.

## The other cases

| Attacker holds | Offline check of a PIN | Result |
|---|---|---|
| Device copy only | No: the vault key needs the node's 256-bit share (checked: `depth/core/lock.ts:70-83`) | 10 live tries, about 5 h 42 min of delays, then a freeze; chance 1 in 100 000 |
| Database dump only | No: the salt is only on the device | Nothing usable. The paper code hash is checkable but the space is 2^80 |
| Live API only | No | Needs a session and the unlock key; otherwise 401 |

Limits of these answers:
- The node's counter lives in Postgres. An operator restoring a backup restores the tries too.
- NOT VERIFIED: that a browser profile copy yields a "non-extractable" key as raw bytes. The device-copy case depends on it.
- NOT VERIFIED: that a browser writes `sessionStorage` to disk. Within the 30 s reload grace, `depth/core/grace.ts` keeps both halves under a key beside them, so such a copy needs no PIN.
- NOT VERIFIED: that the wizard generates a real `VAULT_SHARE_KEY`.

## What the test shows

Refused at every byte position: a sealed message, a half's key and signature. A half signed for another match or for a rekey is refused. Garbage of length 0 to 64 is refused. 20 000 seals gave no repeated nonce.

A key wrap is refused at every byte but one. Byte 25 is the SPKI's unused-bits field; the engine ignores it, the key does not change and the same conversation opens. No gain for an attacker.

Known limits the test pins, so a change will be seen:
- The node reads the exact size of a message: there is no padding.
- The node can withhold or reorder messages: nothing in a box numbers them.
- The list of seen nonces lives in memory, so after a reload the node can replay a message.

## What the node knows about private conversations (minor)

Read from the code by the agent, not re-checked by the session:
- Who talks with whom, in the clear: `match_participants`, `chat_participants`.
- The liked phrase in the clear for the chat's life: `text_snapshot` (`db/031`).
- Times: creation, last own message.
- The ciphertext and its size until delivery. Delivered messages are deleted, and undelivered ones after 260 minutes at most.
- A side's term is 10 to 260 minutes after the last message. Rows are deleted, not marked.
- Caller addresses for 25 hours in `rate_limit_hits`, only for limits keyed by address.
- Request logs hold the path with the chat id and no identity or address. How long the host keeps them is NOT VERIFIED.

## Not covered

Attacks on the page itself (XSS, browser extensions), the libraries, side channels, and a review by an outside cryptographer.
