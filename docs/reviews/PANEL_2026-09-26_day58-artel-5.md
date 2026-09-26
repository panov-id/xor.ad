# Панель ревью 5 · 26.09.2026 · day58, артель: B63–B79 и B70

- **Что ревьюили:** репозиторий xor.ad, ветка day58 = `4746de9`, диапазон `60590aa..4746de9` — 18 коммитов, 15 файлов узла (`relay/node/src`), +316/−73, плюс тесты и документы диапазона.
- **Воспроизвести диапазон:** `git log 60590aa..4746de9`, `git diff 60590aa..4746de9 -- relay/node/src relay/node/db relay/node/test docs`.
- **Линзы:** безопасность (обязательна), данные и СУБД, протоколы и стандарты, эксплуатация, согласованность — пять независимых агентов параллельно, только чтение.
- **Опровержение:** два агента — по коду (11 находок) и по документам и эксплуатации (10 находок); по умолчанию «опровергнуто».
- **Особое внимание (задание координатора):** защита и её побочная работа в одной транзакции; `savepoint()` и `intercepted()`; счёт после COMMIT; страж по `locked_at` против маршрутов с `allowFrozen`.
- **Ведущий:** xor-ad-bf (задача B83). Невлитые ветки B72, B73, B74, B80, B81, B82 — отдельным разделом.
- **Собственная проверка ведущего по стражу:** `allowFrozen` только у `routes/support.ts:50` и `routes/identity.ts:494` (`claimRecovery`) — оба разрешены `chat_RU.md:1301`; страж отказывает и замороженной, и запертой (`lib/identity_guard.ts:144`); билет сокета — то же (`chat/relay.ts:259-260`). ПРОВЕРЕНО grep.

Сырьё линз и опровержений ниже — без правки, как вернули агенты.

## Сырьё: линза «Безопасность»

# Security lens — range 60590aa..4746de9 (day58, B63–B79, B70)

No critical findings. The main protection now holds: the tenth PIN miss stays in place when its freeze or take-down fails on 55P03, 57014 or 40P01.

Run: `scripts/run-relay-database-tests.sh --filter "tenth miss"` gave
`ok | 3 passed | 0 failed | 1 filtered out`. The three B70 cases passed: freeze timeout on close, take-down timeout, take-down deadlock. I did not break the code to watch these tests go red. The pass shows the current code holds, not that the tests would catch a regression.

How the savepoint works, from reading (postgres.js 3.4.4 was not opened on disk — the package is only fetched inside Docker): `lib/db.ts:197` calls `scope.savepoint`. That scope has its own error handler, so a failed statement inside the savepoint does not poison the outer `sql.begin`. This matches the B69 measurement quoted at `lib/db.ts:185-191` and the green tests above.

Checked and found clean:
- The only routes with `allowFrozen` are `routes/support.ts:50` and `routes/identity.ts:493` (paper-code recovery). No other route can let a PIN-locked session through `callerOf`.
- Socket tickets are issued through `callerOf` (`routes/chats.ts:32`) and are refused for a locked share at `chat/relay.ts:260`.
- `callerOf` gives the same 401 for a locked session as for a frozen one (`lib/identity_guard.ts:144`), so there is no oracle.
- The `last_seen` bump is skipped for a locked session (`:191`).
- No FK or trigger can make the take-down throw a code outside the caught ones. `grep -rn "REFERENCES feed_messages" relay/node/db` shows ON DELETE CASCADE only, and there are no triggers.
- `inc()` never throws (`lib/metrics.ts:104-108`), so moving counts into `.then(freezes.count)` cannot undo a commit or the lock.

---

## S1 — When the tenth miss's freeze is deferred, the tab's open chat sockets keep receiving new lines. The spec's named price "until the minute's job" is not bounded by a minute. Level: design defect / contradiction

Where:
- `lib/pin_attempts.ts:128-137`. When `freezeSession` fails with 55P03/57014/40P01 inside the savepoint, the rollback also removes `pg_notify('session_frozen', …)` (`lib/sessions.ts:137`). Nothing else sends a notify.
- `lib/pin_attempts.ts:145` skips the take-down when `frozen` is false.
- `chat/relay.ts:108-111` tears rooms only on that notify.
- `chat/relay.ts:pendingFor` (≈line 50) hands queued lines to an open room with no frozen or locked check.
- `routes/chats.ts:88` keeps queueing `pending_deliveries` for any recipient session with `frozen_at IS NULL`. A locked but unfrozen share is included.

Scenario:
1. A thief holds an unlocked tab. They make the tenth wrong PIN on `POST /identities/close`. That route sets `SET LOCAL lock_timeout = '2s'` (`routes/identity.ts:1098`), so a freeze meeting any row lock on `sessions` fails with 55P03. This is the tested path at `test/pin_limit_rollback.test.ts:222`.
2. `locked_at` commits. `frozen_at` stays NULL. No notify is sent.
3. The tab's already-open WebSocket rooms stay open and are handed every new ciphertext the other side sends. The web client holds the unwrapped keys in memory (chat_RU.md SEC-2 paragraph), so it can read those lines.
4. This lasts until `take_down_pin_limit` manages to write the freeze. That job has no lock timeout, waits up to `statement_timeout` (15 s), and on 55P03/57014 moves on to the next minute (`lib/take_down.ts:84-93`).

The spec at chat_RU.md:1301 accepts "до минутной задачи уже открытый сокет живёт". The same paragraph rejects a one-minute window on the grounds that "минутой она не ограничена: строку сессии можно держать". Those two statements contradict each other when applied to the socket.

Existing tests: the freeze-timeout test does not assert that rooms are torn.

Fix:
- In the `catch` at `pin_attempts.ts:134`, after swallowing the code, send `await run("SELECT pg_notify('session_frozen', $1)", [sessionId])` on the outer `run`. It commits together with `locked_at` and tears the rooms at once. Wrap it in its own `savepoint()` if a failed notify must not poison the outer transaction.
- Add `AND NOT EXISTS (SELECT 1 FROM vault_shares v WHERE v.session = s.id AND v.locked_at IS NOT NULL)` to the recipient join at `routes/chats.ts:88`, or to `pendingFor`.

## S2 — Re-checks inside transactions look at `frozen_at` only, so a request that passed `callerOf` just before the lock goes through as live. Level: minor (race window)

B75 decided that a locked share counts as frozen. But the "asked again under the lock" re-checks still test only `frozen_at IS NULL`:
- `routes/transfer.ts:427` (approveInvite)
- `routes/matches.ts:152` (consent / half)
- `routes/identity.ts:871` (first-PIN init; its upsert at `:902` also clears `locked_at`)
- `routes/support.ts:65` computes `frozen` from the guard's read, before the transaction starts.

Scenario: the thief sends the tenth wrong PIN and, at the same moment, a consent (`matches.ts`) or a support write.
- Both requests pass `callerOf` before the tenth miss commits.
- The tenth miss's freeze is deferred (S1).
- The re-check then sees `frozen_at IS NULL` and the action commits in the person's name after entry was closed.

For support, this means one request written as live: `from_frozen = false`, outside `FROZEN_PER_DAY`, bounded only by `PER_DAY`.

Fixed cases I checked:
- `approveInvite` needs an invite claimed after a PIN-checked `createInvite`, so a thief without the PIN cannot use it.
- `createInvite` (`transfer.ts:129`) calls `checkPin` afterwards, which refuses a locked share.

Fix:
- In the three re-checks, add `AND NOT EXISTS (SELECT 1 FROM vault_shares v WHERE v.session = sessions.id AND v.locked_at IS NOT NULL)`.
- In `support.ts`, derive `frozen` inside the transaction, after the `identity_stats` lock, from `frozen_at` or `locked_at`.

## S3 — The freeze and take-down savepoints swallow only three SQLSTATEs; any other error still rolls back the whole tenth miss. Level: minor (not steerable as far as I found)

Where:
- `lib/pin_attempts.ts:136`: `if (code !== "55P03" && code !== "57014" && code !== "40P01") throw error;`
- `lib/take_down.ts:53-56`: the same three codes.

Commit a3d02de says the tenth miss must stand "whatever its freeze and take-down meet". Any other `PostgresError` inside the savepoint is re-thrown and the tenth miss rolls back, including the attempt and `locked_at`. Two examples:
- 54000, "too many notifications in the NOTIFY queue", from `pg_notify` at `sessions.ts:137` while a listener is stuck.
- A future constraint or trigger added to the take-down.

I found no attacker-controlled trigger: no FK outside ON DELETE CASCADE, no triggers. Status: UNVERIFIED-GAP. I did not find the NOTIFY-queue case described or handled anywhere.

Fix: in both catches, treat any error that has a SQLSTATE `code` as "left to the minute's job", except classes 08 and 57P0 (connection lost or server shutdown). Log the code, and re-throw only JavaScript errors (no `code`).

## S4 — The IPv6 /64 bucket underprices a /48, which is available for free. Level: minor (residual, not a regression)

Where: `lib/rate_limit.ts:269-305`, `bucketAddress` / `prefix64`, and the comment "a /48 from a cloud … the cost of a few IPv4 addresses".

A free tunnel-broker allocation or a common VPS routes a /48 or /56. That is 65,536 or 256 /64 buckets for one actor, far more than "a few IPv4 addresses".

Scenario: per-address limits such as `RECOVERY_CLAIM_LIMITS` (`routes/identity.ts:476`) and `TRANSFER_CLAIM_LIMITS` (`routes/transfer.ts:181`) are meant, per B58, to keep one actor from tripping the node-wide brake. A /48 holder rotates /64s and trips the brake, which pauses recovery and transfer for everyone.

The change is still strictly better than the old per-/128 key.

UNVERIFIED-GAP: I did not check whether Bunny passes IPv6 client addresses in `x-client-ip` (`lib/client_ip.ts:41`).

Fix: in `checkAll`, for IPv6 keys add a second bucket per limit at /48 with a looser maximum (for example 8× the /64 max).

A side note on the same function, also UNVERIFIED-GAP. `prefix64` accepts IPv4-mapped addresses written in hex (`::ffff:c000:201` matches `^[0-9a-f:]+$`) and folds every one of them to `0:0:0:0::/64`. If any address source ever emitted that form, all IPv4 clients would share one bucket. Caddy (Go) and Deno (Rust) print mapped addresses dotted, so I did not see this happen. A one-line guard — return null when the first five groups are 0 and the sixth is `ffff` — closes it.

## S5 — Query functions from `transaction()` / `savepoint()` stay callable after their scope ends, and nothing stops a step from using the outer `run`. Level: minor (no current misuse)

Where: `lib/db.ts:157-162` (`queryOn`) and `:194-198` (`savepoint`). The WeakMap `scopes` keeps a finished scope reachable for as long as the function lives. Two ways this can go wrong:
- **Stale function.** A `run` or `inner` kept past its scope (fire-and-forget, a closure stored in a map) sends statements through a postgres.js scope whose connection may already be back in the pool, possibly inside another request's transaction. UNVERIFIED-GAP: I did not measure what postgres.js 3.4.4 does with a finished scope's handler. My grep for un-awaited `run(` / `inner(` in `lib`, `routes` and `chat` found nothing.
- **Captured outer `run`.** A step that uses the outer `run` instead of the `inner` it was given reopens the B69 trap. A failed statement lands in the outer scope's `uncaughtError` and postgres.js rejects the whole transaction, tenth miss included. Today both call sites pass `inner` straight through (`pin_attempts.ts:131`, `take_down.ts:50`, and `takeDownLive` / `freezeSession` use only their parameter). Nothing enforces this.

`intercepted()` is a production export used only by tests (`test/identity_routes.test.ts:769`). There is no network-reachable path to it.

Fix:
- In `queryOn`, keep an `ended` flag, set it in a `finally` around `begin` and `savepoint`, and make the query function throw once it is set.
- While a savepoint is open, mark the outer query function "suspended" so that using it throws a clear JavaScript error.


## Сырьё: линза «Данные и СУБД»

# Panel 5 — DATA & DBMS lens — 60590aa..4746de9 (day58)

## Summary

- No critical defect found in the range.
- lib/db.ts savepoint()/intercepted() is correct against postgres.js 3.4.4 for every way the code uses it today. I checked this with a real experiment (E1–E6 below). It has one sharp edge, a query function used after its savepoint returned (D1).
- The retry on 40P01 in takeDownLiveInPlace does not work the way the comment says. It succeeds only by making the other side (a consent) the second deadlock victim, and the consent route has no retry. Measured (E7). The 40P01 test does not tell retrying apart from giving up (D2, D3).
- "Counted after COMMIT" (B64/B68): I found no remaining counter that has further statements after it on the same path inside a transaction. There are no DEFERRABLE constraints or triggers in db/, so "last before return" can only be undone by a lost connection at COMMIT (D7).
- Everything else is minor or pre-existing.

## Experiments run

Setup: a throwaway `postgres:16` container (`panel5-data-pg`) on its own network, `denoland/deno:latest`, and `npm:postgres@3.4.4`. The script was run with `docker run --rm --network panel5-data-net … denoland/deno:latest run -A /w/exp.ts`. The container, network and script have been removed.

Deciding output lines:

```
E1 raw SAVEPOINT, caught 22012: begin rejected 22012 rows []
E2 tx.savepoint, caught 22012: begin resolved "ok" rows [1,2]
   leaked failure seen by caller: 22012
E3 leaked sp fn fails after sp returned, caught, then return: begin resolved "ok" rows []
E3b leaked failure caught, then outer statement: begin rejected 25P02 rows []
E4 SET LOCAL in kept sp / in rolled-back sp: begin resolved ["2s","2s"] rows []
E5 nested, inner fails and is caught in outer sp: begin resolved "ok" rows [1,2,4]
   savepoint rejected 22012
E6 step swallows its own failure inside sp: begin resolved "ok" rows [1,3]
E7 A (retry-in-savepoint, parent holds session): attempt 0: 40P01 at 1035ms; attempt 1: took counters at 1304ms | B (consent, no retry): B lost 40P01 after 1002ms
```

What each one shows:

- **E1/E2** confirm the B69 note in db.ts:187-193. A caught failure after a raw SAVEPOINT makes postgres.js reject the whole begin; the same failure inside `tx.savepoint` is held by the savepoint.
- **E5**: nested savepoints are correct. postgres.js names them `s<n>` from one counter per begin, so names never collide.
- **E6**: a step that swallows its own failed statement still gets its savepoint rejected. The scope's `uncaughtError` does this, so savepoint() cannot quietly "succeed" on an aborted subtransaction.
- **E4**: `SET LOCAL` inside a savepoint that is kept lasts until the outer COMMIT. Inside a savepoint that is rolled back, it is reverted.
- **E3**: see D1.
- **E7**: see D2.

---

### D1 — minor (design hazard, not a live defect): a savepoint's query function stays usable after its savepoint returned, and a failure through it commits nothing while `transaction()` resolves

- **Where:** relay/node/src/lib/db.ts:157-162 and :194-198. `queryOn(inner, …)` puts the savepoint's Query into `scopes` (a WeakMap) with no end of life.
- **postgres.js facts:**
  - 3.4.4 never RELEASEs a savepoint, so the subtransaction stays open until COMMIT.
  - A statement sent through the finished inner scope records its error only on that dead scope's `uncaughtError`.
  - The outer scope sends `COMMIT`. On an aborted transaction the server answers with the `ROLLBACK` tag and no error.
- **Measured in E3:** the begin resolved `"ok"` and 0 rows were committed.
- **Failure scenario:** a future step keeps `inner` in a closure, for example in a helper that returns a callback, and uses it after `savepoint()` resolves. The caller catches the failure (as pin_attempts.ts:132-136 catches 55P03, 57014 and 40P01). The route answers 200 or 409, and the tenth miss, freeze and everything else are silently rolled back. This is the exact B69 failure class, with no rejection at all.
- **Today:** I found no leak. pin_attempts.ts:131 and take_down.ts:50 pass `inner` only to a function that is awaited inside the step.
- **Fix:** in `savepoint()`, set a flag once `scope.savepoint` settles. Make the Query returned by `queryOn(inner)` throw after that point (for example `"savepoint query used after its savepoint returned"`), and drop it from `scopes`. It costs a few lines and closes the class.

### D2 — design defect / contradiction: the "retry on 40P01" in takeDownLiveInPlace works only by making the other party the victim, and that party (a consent) is not retried

- **Where:** relay/node/src/lib/take_down.ts:36-42 and :54. The comment reads: "A deadlock is tried again, as a race is".
- **Mechanism:** the cycle is the tenth miss against a consent.
  - The tenth miss holds the session row. freezeSession ran in savepoint s0, which postgres.js never releases, so the lock belongs to the parent transaction for the rest of it. It then waits on identity_stats in s1.
  - A consent (routes/matches.ts:91-97, then :151-153) holds identity_stats and waits on the session with `FOR SHARE`.
  - When the miss is the victim, ROLLBACK TO s1 releases nothing the consent waits on, so the consent keeps waiting. The miss retries and queues on the counters again, which re-forms the cycle.
  - The consent's own deadlock check (one per wait, after `deadlock_timeout`) then fires and the consent becomes the victim.
- **Measured (E7):** A (the miss) got 40P01 at 1035 ms and took the counters on attempt 1 at 1304 ms. B (the consent) got 40P01 after 1002 ms.
- **Effect:**
  - routes/matches.ts:237-240 turns the consent's 40P01 into `storage_failed` and a 503. There is no retry wrapper: `tryAgain` exists only in away.ts:49-60 and in closeOnce's caller.
  - The test says the opposite. relay/node/test/pin_limit_rollback.test.ts:265 reads "as a consent would be, which its route tries again (routes/matches.ts)", and matches.ts has no such retry. That is a contradiction in the test's own rationale.
  - When the consent's check fires *before* the miss re-queues (their waits started within a few ms of each other), the miss is the victim on every attempt. Each attempt costs `deadlock_timeout` (1 s), for about 3 s holding the share, the session and a pool connection (POOL_SIZE = 4, db.ts:37), then it returns false. I reasoned this edge from the one-check-per-wait rule; I did not measure it.
- **Fix, pick one:**
  - (a) Keep the retry and say what it does: "the retry makes the other side the victim". Then give the consent route the same `tryAgain` loop that away.ts has (matches.ts:82). The loser then retries instead of answering 503.
  - (b) Treat 40P01 like 55P03 in takeDownLiveInPlace (`return false`) and let the minute's job finish. That is cheaper, and the consent goes through.
  - Either way, fix the test comment at pin_limit_rollback.test.ts:265.

### D3 — minor (test strength): the 40P01 test passes whether or not the take-down retries

- **Where:** relay/node/test/pin_limit_rollback.test.ts:256-294, specifically the assertion at :287: `assert(holderGotSession || holderLost === "40P01")`.
- **Scenario:** change take_down.ts:54 from `continue` to `return false` on 40P01.
  - The miss loses the first cycle and commits with attempts 0, the lock set, and the freeze counted once.
  - The holder then gets the session (`holderGotSession = true`), and `takeDownLeftByPinLimit()` at :292 takes the phrase down.
  - Every assertion stays green.
- **What the test does guard:** a 40P01 that is thrown instead of caught. It does not guard the retry that the name, the comment and take_down.ts:36-42 describe.
- **Fix:** assert which outcome happened. Either assert `holderLost === "40P01"` together with "phrase gone before the job ran" (retry kept, D2 option a), or assert the reverse (D2 option b). Then break the other branch and watch it go red.

### D4 — minor (lock_timeout placement): the tenth miss's freeze has a 2 s lock timeout only on the close route; elsewhere it waits the full 15 s statement_timeout holding the share and a pool connection

- **Where:**
  - `SET LOCAL lock_timeout` in these routes exists only in closeOnce (routes/identity.ts:1098).
  - vaultShare (identity.ts:787), changePin (identity.ts ~972) and createInvite (transfer.ts:104) call `checkPin` without one. The freeze in its savepoint (pin_attempts.ts:131) therefore waits on the session row until `statement_timeout` (db.ts:54-57, 15 s), which is then caught as 57014.
  - The minute's job has the same gap: take_down.ts:84-88 (share `FOR UPDATE`, then freeze) has no lock_timeout, so each of up to 100 sessions can wait 15 s in one pass.
- **Scenario:** a session row held by a slow transaction (for example a claim or approve waiting on its own locks) makes `POST /vault/share` on the tenth miss take 15 s. It holds 1/4 of the pool the whole time.
- **Tests:** only the close route's 55P03 path is tested (pin_limit_rollback.test.ts:222). No test covers 57014 on /vault/share.
- **Fix:** in pin_attempts.ts, run `SET LOCAL lock_timeout = '2s'` as the first statement *inside* the freeze savepoint. It is then scoped per E4: reverted if the savepoint rolls back, kept if the freeze succeeds, and harmless because the path returns 409 right after. Do the same at the start of the job's per-session transaction at take_down.ts:84.

### D5 — minor (informational, E4): takeDownLive's `SET LOCAL lock_timeout = '2s'` (take_down.ts:146) outlives its savepoint when the take-down succeeds

- **Measured:** `["2s","2s"]` in E4.
- **Today:** harmless. Every in-place caller returns right after checkPin's tenth miss.
- **Risk:** a future statement after `checkPin(...)` returns on the tenth miss would silently inherit a 2 s lock timeout.
- **Fix:** add one sentence to the comment at take_down.ts:146, or reset it at the end of takeDownLiveInPlace. No code change is required now.

### D6 — minor, UNVERIFIED-GAP (by reading, not exercised): consent and first-PIN re-reads under lock do not include the locked share (B75 hole on the race path)

- **Where:**
  - routes/matches.ts:151-155 re-reads the session under `FOR SHARE` with only `frozen_at IS NULL`.
  - identity.ts:871 (vault init) is the same.
  - B75 put `pin_locked` into the guard (identity_guard.ts:142), B78 into the ticket (chat/relay.ts:260), and B79 into support. These in-transaction re-reads were written to catch "a freeze that committed while this waited", and they were not extended.
- **Scenario:**
  1. The tab passes the guard.
  2. The tenth miss commits with its freeze timed out (D4 or the close route's 2 s), so `locked_at` is set and `frozen_at` is NULL.
  3. The consent's `FOR SHARE` then sees `frozen_at IS NULL` and publishes a half for a PIN-locked session.
  - The window is narrow: the freeze has to have failed.
- **Fix:** add `AND NOT EXISTS (SELECT 1 FROM vault_shares v WHERE v.session = sessions.id AND v.locked_at IS NOT NULL)` to matches.ts:152, or read `pin_locked` in the same statement.

### D7 — result of task 3 (no new defect): counters and side effects inside transactions

Method: a script walked every `transaction(` body in relay/node/src, listed each `inc(`, `setGauge(`, `send(` and `fetch(` in it, and counted the awaits after it. I then read each hit with `grep -A3`.

- **Every hit is either:**
  - the last statement before a `return` in that branch. Examples: matches.ts:122,130,173,211,235; likes.ts:87-243 and 285-338; transfer.ts:132,153,209-229,458,488; identity.ts:622,708,805,815,874,890,906,981,1011,1109,1164,1218-1278; away.ts:98,122,156; blocks.ts:91,143; support.ts:81,120,145; chats.ts:115,207,364; feed_verdict.ts:176,193,225; away_waker.ts:27.
  - or `meter("wrong_pin")` in pin_attempts.ts:156, which comes after the in-place take-down and right before `return refuse(...)`.
- **None has statements after it on the same path.**
- **Other side effects:**
  - `pg_notify` inside transactions (sessions.ts:132, identity_sweeper.ts ~383, profile.ts:199) is transactional. Postgres discards it on rollback, including rollback to a savepoint. This is covered by session_freeze.test.ts:141-155 for the top level.
  - I found no mail send or `fetch` inside a transaction body. The DSA retry (notice_notify.ts:176-232) sends outside any transaction, under a lease.
- **COMMIT failure:** `grep -rniE "deferrable|initially deferred|constraint trigger|serializable" db src` finds nothing. No production COMMIT can fail for a data reason, so the rule written at sessions.ts:78-85 ("last before return stays") holds. The only way a counted-then-lost count happens is a connection dropped at COMMIT.
- **Freezes and burns:** every `freezeSession` and `burnShare` caller (identity.ts:636/786/971/1084, transfer.ts:104/382, take_down.ts:82, pin_attempts.ts:129) makes one `Freezes` per attempt and chains `.then(freezes.count)` (or `freezes.take` after the savepoint). A rolled-back or retried attempt cannot count.

### D8 — minor (partial failure in batches): results of task 4

- **feed_verdict.ts:286-317 (sweepExpiredPhrases):**
  - Each batch is an autocommit statement and is counted per batch. batch_counts.test.ts:67-95 checks this with a real `BEFORE DELETE` trigger that raises. The failure is real, not faked in JS.
  - Note: `took < batch` ends the pass when SKIP LOCKED skipped rows. That is intended; the rest waits a minute.
- **identity_sweeper.ts closeInactive (131-256):**
  - Skips are accumulated per batch and counted after that batch's COMMIT (:197). A batch that rolls back throws out of the loop, and earlier batches have already been counted.
  - The raw `SAVEPOINT sweep_shares` (:193, :208, :213-214) is safe. Every statement in it is SKIP LOCKED and never waits, and none of its failures is caught, so a 57014 rejects the whole batch as intended. It only contradicts the wording at db.ts:187 ("never a hand-written SAVEPOINT"). The comment could name this exception.
- **identity_sweeper.ts closeIdentities (:403), pre-existing:**
  - The loop stops on `frozen + burned + faces === 0`, but the batch also does `unlinked` (support_requests), and the pick at :329 selects identities whose *only* undone thing is that link.
  - A batch made up only of such identities unlinks them and commits, then stops the pass. Any further backlog waits an hour.
  - Fix: return `unlinked` too and include it in the stop test, or stop on `picked.length < BATCH`.
- **take_down.ts takeDownLeftByPinLimit (71-131):**
  - The freeze loop and the take-down loop are per identity and per transaction, and count per commit.
  - Timeouts and deadlocks are skipped per item; any other error aborts the rest of the pass. That is acceptable for a job that runs every minute.
  - See D4 for the missing lock_timeout on the freeze loop.

### D9 — minor (pre-existing, but pinned by a new test): PATCH /identities/me turns a database failure into a 500, not the 503 its last line intends

- **Where:**
  - routes/profile.ts:105-219: `transaction(...)` has no `.catch`, so `answer` is never null, and `?? refuse("unavailable", …, 503)` at :221 is dead code.
  - The throw becomes `{"error":"internal"}` 500 in dispatch.ts:~113-133.
  - The B77 test expired_take_down.test.ts:222-236 asserts that the route *throws* (`refused.includes("b77: refused on cue")`), so it now pins the 500 behaviour.
- **Fix:** add `.catch((error) => { log(...); return null; })` so the 503 line is live, and change the test to expect 503 while still asserting that nothing was counted.

### D10 — result of task 5: do the tests fail for the right reason?

- **Real database failures:**
  - pin_limit_rollback.test.ts: real row locks in a second connection, and `waitingOn` checks through `pg_blocking_pids` that the intended statement is the one waiting (:172-183).
  - batch_counts.test.ts: `BEFORE DELETE` triggers that raise.
  - expired_take_down.test.ts:216-221 and identity_sweeper.test.ts:1170-1230: `DEFERRABLE INITIALLY DEFERRED` constraint triggers, which fail the real COMMIT.
  - dsa_decision_letter.test.ts:186-190: a trigger.
- **JS-faked failures:**
  - identity_routes.test.ts:769 rejects `TakeDownRetry` through `intercepted`. That is legitimate, because TakeDownRetry is a JS error in production too.
  - session_freeze.test.ts:147 is a JS throw, which is fine for "rolled back, not announced".
- **Weaknesses:**
  - D3: the 40P01 retry is unguarded.
  - The triggers are created in the shared test database and dropped in `finally`. A crash between create and `try` (for example batch_counts.test.ts:49-53, before `try` at :81) would leave a trigger that poisons later suites. This is low risk.

---

**Not verified live:** D6 and D8 (the unlinked stop) are from reading only. The D2 edge "the miss loses all three attempts" is reasoned from Postgres's one-deadlock-check-per-wait, not measured.


## Сырьё: линза «Протоколы и стандарты»

# Panel 5 — PROTOCOLS & STANDARDS lens (60590aa..4746de9, day58, B63–B79 + B70)

Repo: xor.ad, worktree par-B83 at 4746de9. Read-only. What I ran:

- `git log --oneline 60590aa..4746de9`, `git diff --stat 60590aa..4746de9`
- `git diff 60590aa..4746de9 -- relay/node/src/lib/rate_limit.ts relay/node/src/routes docs/api/openapi.yaml docs/protocol_RU.md docs/chat_RU.md docs/facts/limits.tsv relay/node/src/lib/sessions.ts relay/node/src/lib/pin_attempts.ts relay/node/src/lib/identity_guard.ts`
- A copy of `bucketAddress`/`prefix64` taken verbatim with `sed` from `relay/node/src/lib/rate_limit.ts` at 4746de9, run on edge forms:
  `docker run --rm -v <scratchpad>/panel5:/w -w /w denoland/deno:latest run /w/p64.ts`
  Output (quoted where used below):
  ```
  "::ffff:c000:280" -> 0:0:0:0::/64
  "::ffff:c000:281" -> 0:0:0:0::/64
  "::ffff:8.8.8.8" -> ::ffff:8.8.8.8
  "8.8.8.8" -> 8.8.8.8
  "[2001:db8::1]:443" -> [2001:db8::1]:443
  "2001:DB8:0:0:1::" -> 2001:db8:0:0::/64
  "64:ff9b::c000:280" -> 64:ff9b:0:0::/64
  "64:ff9b::1.2.3.4" -> 64:ff9b::1.2.3.4
  "2001:0:4136:e378:8000:63bf:3fff:fdd2" -> 2001:0:4136:e378::/64
  "2001:0:4136:e378:8000:63bf:1111:2222" -> 2001:0:4136:e378::/64
  "fe80::1%25eth0" -> fe80:0:0:0::/64
  "::" -> 0:0:0:0::/64
  "2001:db8::1, 10.0.0.1" -> 2001:db8::1, 10.0.0.1
  ```
- greps over `relay/node/src`, `docs/api/openapi.yaml`, `docs/protocol_RU.md`, `depth/` (cited inline).

Nothing here was run against a live node; every finding is from code plus the Deno probe above.

---

## P1 — design defect (trigger UNVERIFIED-GAP): hex-spelled IPv4-mapped addresses all fold into one `::/64` bucket

- Where: `relay/node/src/lib/rate_limit.ts:231-246` (`prefix64`), used by `check()` at `:361` for every per-address limit.
- What: the comment at `:220-221` says IPv4-mapped IPv6 "(a dot in it) stay as they are". That holds only for the dotted spelling. RFC 4291 §2.2 (form 3 is optional; form 1/2 are equally valid text) and §2.5.5.2 (`::ffff:0:0/96`) allow the same address in pure hex, `::ffff:c000:280`. The probe shows `::ffff:c000:280` and `::ffff:c000:281` (192.0.2.128 and 192.0.2.129) both → `0:0:0:0::/64`. So does IPv4-compatible `::a.b.c.d` in hex, and `::1`.
- Scenario: if any hop ever hands the node an IPv4 client as hex-mapped IPv6, every IPv4 visitor lands in one bucket per limit. Ten transfer claims an hour (`transfer.claim.hour`), ten identity creations an hour, ten Art. 16 notices an hour (`report.ts:117-118`) then cover **the whole IPv4 internet**. One script refuses signups and notices for everybody, which is exactly what `client_ip.ts:57-61` says the limiter must not allow.
- Is it reachable? UNVERIFIED-GAP. The node listens on `0.0.0.0` (`relay/node/src/main.ts:38`), so the socket address is never IPv6. IPv6 arrives only through headers: Caddy's `X-Forwarded-For` (Go prints a v4-mapped `net.IP` as dotted IPv4, so it cannot produce the hex form) and Bunny's `X-Client-IP` (`client_ip.ts:40`), whose format for IPv4 over IPv6 I did not check. The spelling the header uses is outside our code, and RFC 5952 §5 only *recommends* dotted.
- Fix: in `prefix64`, after the groups are expanded, return `null` when groups 0–4 are zero and group 5 is `ffff` or `0` (mapped or compatible). Better still, convert the address to dotted IPv4 so it shares the IPv4 client's bucket. Also keep `::/64` itself (loopback, unspecified) whole. Add `"::ffff:c000:280" !== "::ffff:c000:281"` to `rate_limit.test.ts` ("IPv4, IPv4-mapped IPv6 … keep their own keys"), which today tests only the dotted form.

## P2 — minor: other textual forms the fold treats inconsistently (RFC 4291 §2.2, §2.5.5; RFC 5952 §4, §5)

- Where: `relay/node/src/lib/rate_limit.ts:224-246`.
- a) **Same host, two buckets.** `::ffff:8.8.8.8` → kept whole, `8.8.8.8` → kept whole. These are different keys for one IPv4 host, so each gets its own quota. An attacker cannot choose the spelling through Caddy (last XFF entry), so this is not a bypass today. It is the same normalisation gap as P1, the other way round.
- b) **Bracketed address with a port.** `[2001:db8::1]:443` is not folded: `startsWith("[") && endsWith("]")` is false, and it stays the whole string. If a proxy ever writes the RFC 7239-style `[addr]:port`, every source port becomes its own bucket and B76 is void. Not produced by Caddy's XFF. Bunny is unverified.
- c) **NAT64 and Teredo.** Hex `64:ff9b::c000:280` → `64:ff9b:0:0::/64`, so all NAT64-translated IPv4 clients share one bucket (RFC 6052 §2.1 well-known prefix). The dotted form is kept whole, which is inconsistent again. Teredo (`2001::/32`, RFC 4380 §4) folds by server address and flags, so all Teredo clients of one server share one bucket (probe: two different Teredo clients → `2001:0:4136:e378::/64`). This is collateral lockout, not a bypass.
- Fix: normalise before folding. IPv4-mapped/compatible and `64:ff9b::/96` become dotted IPv4. Strip `[..]:port`. Optionally leave Teredo (`2001:0::/32`) whole.
- Note, not a defect: the key `2001:db8:0:0::/64` is not RFC 5952 §4.2.2 canonical (`2001:db8::/64`). It is an internal map key and is never logged or exported (`rate_limit.ts:353-381`, no `log`/`inc` carries it), so this does not matter.

## P3 — contradiction: after B75 a locked-PIN device gets `401 unauthorized`, never `409 pin_locked`, and protocol/openapi still describe the latter

- Where: `relay/node/src/lib/identity_guard.ts:144`. A session whose share has `locked_at` is refused `401` before any route runs. The PIN routes all go through `callerOf` without `allowFrozen`: `/vault/share` (`identity.ts:~783`), `/vault/pin` (`~966`), `/identities/close` (`:1051`), `/sessions/invite` (`transfer.ts:~100`). So `checkPin`'s `row.locked_at` branch (`pin_attempts.ts:67-74`, `409 pin_locked`) is now reachable only in a race: two in-flight requests of one session, where the second waits on the share row while the first spends the tenth attempt.
- Spec says otherwise:
  - `docs/protocol_RU.md:133` (`POST /vault/share`): "после десятой — `pin_locked`". It is true only for the answer to the tenth attempt itself (`pin_attempts.ts:157`). Every later call is `401`.
  - `docs/api/openapi.yaml` `components.responses.Unauthorized` (~line 797) lists only signature causes: missing, malformed, outside the ±5 min window, not the session's. It names neither a frozen session nor a PIN-locked one, and B75 adds the second as a new 401 cause.
  - `depth/core/client.ts:213-214` (xor.ad repo, the `depth` terminal client): "the tenth pin_locked and the session frozen". `depth/ink/rooms.ts:1104` and `depth/ink/move.ts:30` map only `pin_locked` to the "entry closed until the paper code" line.
- Scenario: a web tab or `depth` restarts after the tenth miss. Every signed call now answers `401 unauthorized` with the same body as a bad signature (`identity_guard.ts:84-88`). The client cannot tell "your signature is wrong, re-sign" from "entry is closed, go to the paper code", which is the distinction `pin_attempts.ts:152-156` says the separate code exists for. Before B75 this was already the case whenever the freeze committed. B75 makes it universal and removes the one path that surfaced `pin_locked` on a later call (freeze deferred).
- RFC note: a request with a valid signature refused because of account state is RFC 9110 §15.5.4 (403) territory, not §15.5.2 (401). Using 401 is a deliberate no-oracle choice (`identity_guard.ts:141-143`, "telling them apart would report on the account"). That is defensible. The contract just has to say it.
- Fix (doc only, keeps the no-oracle rule): in `protocol_RU.md`/`_EN.md` §4.1 `/vault/share` and §6, and in openapi `Unauthorized`, add: "сессия заморожена (`frozen_at`) или её ПИН заперт (`locked_at`) — тот же 401 `unauthorized`; `pin_locked` приходит только ответом на десятую ошибку". In `pin_attempts.ts:67`, note that the branch is race-only after B75. On the client side, say that the tenth answer's `pin_locked` must be persisted locally, because the node will not repeat it.

## P4 — minor (RFC semantics): the node-wide transfer pause is `429 rate_limited`, the same code as the caller's own address limit

- Where: `relay/node/src/routes/transfer.ts:174-179` (pause) vs `:181-186` (per address). Codified in this range by `docs/api/openapi.yaml:1696`.
- RFC 6585 §4: 429 means "the **user** has sent too many requests in a given amount of time". The pause is tripped by fifty misses from anyone on the node (`recovery_misses.ts:30`), and a person entering a genuine code for the first time gets it. RFC 9110 §15.6.4 (503, "temporary overload … MAY send Retry-After") describes that state. Both answers carry the same `error.code` `rate_limited`, so the client cannot show "the node has paused transfers, not you". `docs/watchdogs_RU.md` (TransferBrakeOn) itself says "пока пауза, честный перенос тоже не принимается".
- The enum already has `paused` (`openapi.yaml:277`).
- Fix: keep 429 if clients depend on it, but answer the pause with `code: "paused"` (or 503 `unavailable` plus `Retry-After`), and update openapi `:1696` to name two codes. The same applies to the recovery brake if it answers the same way (not checked in this range).

## P5 — contradiction/minor: the `/sessions/claim` responses in openapi are incomplete, and the new 429 is inline without its header

- Where: `docs/api/openapi.yaml:1694-1696`.
- The new `"429"` is an inline description only: no `headers: {Retry-After}` and no `content: ApiError`. The shared `components/responses/RateLimited` (`:808-811`) declares both, and so does the neighbouring `/recovery/claim` 429 (`:1770`). The text says "Retry-After in seconds" while the schema does not declare the header. Generated clients will not expose it.
- The operation still lacks responses the code returns:
  - 400 `protocol_version_unsupported` / `invalid_body` (`transfer.ts:171-195`)
  - 404 `not_found` (`:211`)
  - 409 `refused` on a second claim (`:222`)
  - 503 `unavailable` (`:235`)
  - The 200 has no schema, although the route answers `{state:"claimed"}` (`:230`; `protocol_RU.md:138`).
- Fix: `"429": {$ref: "#/components/responses/RateLimited"}` (with the per-address/pause wording kept in the operation `description`), plus `"400": BadVersion`, a 404 with ApiError, `"409": Conflict`, `"503": Unavailable`, and a 200 schema `{state: enum [claimed]}`.

## P6 — minor (RFC 9110 §15.5.2 MUST), known and widened by B75: 401 without `WWW-Authenticate`

- Where: `relay/node/src/lib/identity_guard.ts:84-88` (`unauthorized()` → `refuse(...,401)`, and `refuse` at `:71-82` adds only the sunset header).
- RFC 9110 §15.5.2: "The server generating a 401 response MUST send a WWW-Authenticate header field". `grep -rin www-authenticate relay/node/src docs` finds nothing in code. The only hits are the earlier panel `docs/reviews/PANEL_2026-09-21_steps1-2.md:173` (xor.ad repo), which already proposed `WWW-Authenticate: XorIdentity realm="relay"`. B75 routes one more state (locked PIN) through this 401.
- Fix: add the header in `unauthorized()`. It is one line and reveals nothing (same value for every cause).

## P7 — minor (spec price incomplete), DSA Art. 16(1) touchpoint: the /64 fold also merges a LAN, and the spec names only the /48 side

- Where: `docs/protocol_RU.md:417` / `docs/protocol_EN.md` (same paragraph) and `docs/facts/limits.tsv:58`. Code comment at `rate_limit.ts:218-221`.
- The spec prices only "у хоста с сетью /48 своя корзина на каждый /64". The other side is not named: every device on one SLAAC LAN (home, office, campus Wi-Fi, all in one /64) now shares every per-address budget. Before B76 each had its own. The shared budgets include:
  - identity creation 10/h, 30/day (`IDENTITY_CREATE_LIMITS`, `rate_limit.ts:143`)
  - recovery claims 10/h, 30/day
  - Article 16 notices 10/h, 40/day (`REPORT_LIMITS`, `rate_limit.ts:74-77`, used at `routes/report.ts:117-118`)
- It is the IPv6 twin of IPv4 NAT, which the code comment acknowledges. The owner-facing spec does not say it. For notices, DSA Art. 16(1) requires the mechanism to be "easy to access and user-friendly". Ten per hour per LAN is still reasonable, and the 429 carries `Retry-After` and "write to support" (`report.ts:119-123`), so this is not a DSA defect, only an unnamed price.
- Fix: one sentence in §5 RU/EN: "и наоборот: все устройства одной сети /64 (домашний или офисный Wi-Fi) делят одну корзину — как за одним IPv4-адресом NAT".

## P8 — checked, no defect found

- **Retry-After format** (RFC 9110 §10.2.3, `delay-seconds = 1*DIGIT`): every changed or touched 429 sends an integer ≥ 1:
  - `rate_limit.ts:372` `Math.max(1, Math.ceil(...))`
  - `shared_misses.ts:47` `Math.ceil`, only when > 0
  - `support.ts:113` `Math.max(1, Number(...))` over a `ceil(...)` text
  - `pin_attempts.ts:77` `Math.ceil`

  `pin_locked` deliberately has none (`pin_attempts.ts:68-71`). That is correct: RFC 9110 §10.2.3 gives Retry-After meaning for 503 and 3xx, and RFC 6585 §4 says MAY for 429. 409 is right for a lock with no time bound, and 423 (RFC 4918 §11.3) is WebDAV lock semantics, which do not apply here.
- **`/sessions/claim` numbers**: openapi `:1696` (10/h, 30/day, 50 misses, 15 min) matches `rate_limit.ts:235-236`, `recovery_misses.ts:30` and `limits.tsv:98-99,106-107`.
- **`POST /support` from a PIN-locked session** (B79, `support.ts:62-121`):
  - The locked share reads as reason `pin_limit`.
  - The caller's own locked session no longer counts as "another live session".
  - The frozen share is capped at `support.frozen.day` = 1 with 429 + `Retry-After` + `until`.
  - A transfer- or close-frozen session gets 401.

  This matches `protocol_RU.md:315`, `chat_RU.md` §8.2 (diff line "не больше 1 обращения в сутки … пока у личности нет другой живой сессии") and `limits.tsv:48`.

  Nonce replay: it is checked before the frozen gate (`support.ts:77-84`), so a replay returns the stored 201 even if the session was frozen since. That is consistent with RFC 9110 §9.2.2 replay semantics and protocol §2 (`protocol_RU.md:96`).
- **DSA Art. 16(5)** wording in the range (`alerts.yml` DsaDecisionLetterExhausted, `watchdogs_RU.md:188`, `notice_notify.ts:164-174`). "Письмо о решении по ст. 16(5)" is the right article: notify the notifier of the decision "without undue delay" with redress information. The gauge now holds until `decision_sent_at`, which fits "without undue delay" better than a one-hour increase. It is limited to rows that have been attempted (`decision_attempts >= MAX`). Only `upheld`/`rejected` ever get `decided_at` (`routes/dsa.ts:325,365`; intake statuses `target_gone`/`not_accessible` never do), so no false page from other statuses. No GDPR wording changed in the range.
- **`/identities/me`**: not changed in the range. It gets the B75 401 for a locked session like every non-`allowFrozen` route. `GET /support` is not `allowFrozen` (`support.ts:154`), which matches protocol `:316`.


## Сырьё: линза «Эксплуатация»

# Panel 5 — OPERATIONS lens — xor.ad day58 60590aa..4746de9 (B63–B79, B70)

Repo: `xor.ad`, worktree `.claude/worktrees/par-B83` at 4746de9. Read-only. No tests or promtool were run by this lens: every item below comes from reading the code at the cited lines. Nothing here was checked against a live database.

Commands run (all read-only):
- `git log --oneline 60590aa..4746de9`, `git diff --stat …`, `git diff 60590aa..4746de9 -- relay/node/src ':!*test*'`
- `git diff 60590aa..4746de9 -- relay/local/observability docs/facts docs/watchdogs_EN.md docs/test-map_EN.md`
- `grep -rn "lock_timeout\|statement_timeout\|idle_in_transaction" relay/node/src`
- `grep -rn "checkPin(\|takeDownLiveInPlace(\|takeDownLive(\|freezeSession(" relay/node/src`
- `grep -rn "SAVEPOINT\|savepoint" relay/node/src`, `grep -n "expr:" relay/local/observability/alerts.yml`
- `grep -rn "take_down\|pin_limit\|К5" docs/facts/*.tsv docs/reviews/PANEL_2026-09-26_day58-artel-4.md`
- `grep -n "INDEX.*dsa_notices" relay/node/db/*.sql`

## Map: routes that call checkPin or a take-down, and their lock_timeout

| Path | File:line | lock_timeout before the PIN row / freeze |
|---|---|---|
| POST /vault/share | routes/identity.ts:787 → checkPin :792 | **none** (statement_timeout 15 s only) |
| POST /vault/pin (changePin) | routes/identity.ts:972 → checkPin :991 | **none** |
| POST /sessions/invite (createInvite) | routes/transfer.ts:105 → checkPin :135 | **none** |
| POST /identities/close (closeOnce) | routes/identity.ts:1098 `SET LOCAL lock_timeout='2s'` → checkPin :1112, takeDownLive :1126 | 2 s |
| tenth miss → takeDownLiveInPlace | lib/pin_attempts.ts:145 → take_down.ts:50 → takeDownLive sets `SET LOCAL lock_timeout='2s'` at take_down.ts:146, **after** the guess SELECT | 2 s (only from :146 on) |
| away (stepAway) | routes/away.ts:126 → takeDownLive | 2 s from take_down.ts:146 |
| job take_down_pin_limit, freeze loop | take_down.ts:79-94 | **none** |
| job take_down_pin_limit, take-down loop | take_down.ts:107-128 → takeDownLive | 2 s from :146 |

Pool: `POOL_SIZE = 4` (lib/db.ts:37); `statement_timeout` = `idle_in_transaction_session_timeout` = 15 s (lib/db.ts:77-78). No path in the range sleeps between retries. The retries are: takeDownLiveInPlace up to 3 (take_down.ts:48), the job's take-down up to 3 per identity (take_down.ts:111), and closeOnce/stepAway through tryAgain (away.ts:49-62).

---

## O1. Design defect. None of the three "left for later" outcomes has a metric or an alert: freeze deferred, take-down given up in place, job deferral
- **Where:**
  - `lib/pin_attempts.ts:133-137`: the freeze savepoint fails with 55P03/57014/40P01. It is swallowed with no log line and no counter.
  - `lib/pin_attempts.ts:145`: the `boolean` returned by `takeDownLiveInPlace` is discarded. `take_down.ts:55` returns `false` on 55P03/57014, and `:59` returns `false` after 3 races. Neither is logged or counted.
  - `lib/take_down.ts:92` and `:124`: the job's deferrals produce only `log("warn")`.
  - `takeDownLeftByPinLimit` returns `done` (take_down.ts:131), but the handler discards it (scheduled.ts:300-302).
  - `grep -n "relay_take_down\|deferred" relay/node/src` finds nothing.
- **3 a.m. scenario:**
  - A row is held on one identity, for example by a stuck transaction or a sweep batch.
  - The tenth miss locks the PIN, and its freeze rolls back to the savepoint without a sound.
  - The job then retries every minute. Each pass logs one `warn` and nothing more.
  - Meanwhile the open WebSocket rooms of that session stay open. They close only on `NOTIFY session_frozen` (chat/relay.ts:108-111), and that notify is sent only when a freeze commits (sessions.ts, freezeSession's pg_notify).
  - B75 (identity_guard.ts:142) and B78 (relay.ts:260) close the HTTP routes and new tickets. They do nothing for a room that is already open.
  - An operator cannot see the state "PIN locked, session not frozen" at all. The first visible sign is a tombstone (JobChainDead), and that appears only if the job starts *throwing* (see O3).
- **Fix:** add a scrape-time gauge, the same pattern as B63's `DECISION_LETTER_GIVEN_UP`:
  - query: `SELECT count(*) FROM sessions s JOIN vault_shares v ON v.session=s.id WHERE v.locked_at IS NOT NULL AND s.frozen_at IS NULL`
  - gauge: `relay_pin_limit_unfrozen_sessions`
  - alert: `max(...) > 0 for: 5m`

  A second gauge counts identities that match the job's `left` predicate (take_down.ts:96-107) with `for: 5m`. Together they cover "freeze left for the job", "take-down given up" and "pass keeps deferring" without a per-process counter, and they survive a node restart. Optionally, also add `relay_take_down_pin_limit_total{result="done|deferred|failed"}` with zeros at start, as panel 4 K5 proposed.

## O2. Contradiction. The watchdogs docs promise a counter "after B70". B70 is in this range, and no counter or tracking item exists
- **Where:**
  - `docs/watchdogs_EN.md` (added in this range): "It has no gauge or alert of its own … a counter with an alert comes after B70 (panel 4, K5)".
  - The RU twin says the same: `docs/watchdogs_RU.md:190`.
  - B70 is in this range: take_down.ts:34-47 and the comments cite B70, commit a3d02de.
  - `grep -n "take_down\|pin_limit\|К5" docs/facts/open.tsv` finds nothing, so no open item tracks the promise.
- **Effect:** the docs now describe a future that has already arrived and is not done. A reader cannot tell whether K5 is closed or forgotten.
- **Fix:** either build O1 now, or add an `open.tsv` row (id e.g. `take_down_pin_limit.unwatched`) and reword both watchdogs lines to point at it instead of "after B70".

## O3. Design defect (carried over from panel 4 K5 point 1, half fixed). An error other than a lock error on one row still aborts the whole pass
- **Where:**
  - freeze loop: `lib/take_down.ts:91` `if (code !== "55P03" && code !== "57014" && code !== "40P01") throw error;`
  - take-down loop: `lib/take_down.ts:122` `if (!again && !timedOut) throw error;`
- **What B70 fixed:** lock and statement timeouts now `break` to the next identity.
- **What it left:** anything else is still thrown out of the pass. That includes a constraint violation, a trigger error, 08006 on one connection, or a TypeError on an unexpected row.
- **Scenario:** one identity, first by `i.id`, fails on every pass with, say, 23xxx. The results:
  - every identity after it is never processed;
  - the job goes to backoff at 30·n² s (jobs.ts:190) and becomes a tombstone after max_attempts;
  - it is re-armed hourly (scheduled.ts:~421);
  - JobChainDead flaps. The alert is `relay_jobs_tombstones > 0 and relay_jobs_standing == 0` (alerts.yml:15). It goes quiet once re-armed, even though the work is not done.
- **Fix:** in both loops, log `{code, attempt}` at `error` level, count `failed`, and `continue`. Rethrow only for connection-class errors (SQLSTATE class 08, or `query`-level failure) so the job-level retry still applies to an outage.

## O4. Design defect. The tenth-miss freeze and the job's freeze loop wait up to the 15 s statement_timeout, and the pool holds 4 connections
- **Where:**
  - `routes/identity.ts:787/972`, `routes/transfer.ts:105`: no `SET LOCAL lock_timeout` before `checkPin` (grep result above; only identity.ts:1098 sets one).
  - `lib/pin_attempts.ts:131`: the freeze's `UPDATE sessions … WHERE id=$1` (in freezeSession) waits on the session row.
  - The comment at pin_attempts.ts:113-116 itself says "a caller's route *may* carry a lock timeout (closeOnce: two seconds)". Three of the four callers do not.
  - The job's freeze loop (take_down.ts:84-88) has no lock_timeout either. It covers `SELECT … FOR UPDATE` on vault_shares and the UPDATE of sessions.
- **Scenario 1, a request:** during a sweep batch or another freeze that holds the session row, a tenth miss on `/vault/share` holds:
  - its pooled connection;
  - the vault_shares row lock, which blocks every other PIN route of that session and the job.

  It holds them for up to 15 s before 57014 turns it into a deferred freeze. Before this range, 57014 rolled the whole transaction back after the same 15 s. So the holding time is not new, but B59/B70 now make "wait 15 s, then defer" the designed path. The `FOR UPDATE` in checkPin (pin_attempts.ts:57-61) has the same unbounded wait. Four such requests at once use up the node's pool for 15 s: every route returns 503 or queues.
- **Scenario 2, the job:** with rows held, each of up to 100 sessions (LIMIT at take_down.ts:79) can take 15 s, so one pass can run 25 min. That is longer than the job's 10-minute lease (jobs.ts:130-137, "Ten minutes is ordinary to overrun … another node claims the same row"). A second node then starts a concurrent pass over the same rows. The lease token protects only the jobs row, not the work.
- **Level:** design defect. Low probability, because it needs held session rows, but it is unbounded by design and inconsistent with closeOnce.
- **Fix:**
  - In `checkPin`, before the vault_shares `FOR UPDATE`, run `SET LOCAL lock_timeout = '2s'`. That makes the rule live in "the rule" (pin_attempts.ts:15-17) rather than in one of four callers.
  - In the job's freeze transaction, the same `SET LOCAL lock_timeout='2s'` before take_down.ts:86.

## O5. Minor. Both job selections use `ORDER BY … LIMIT 100`, and a head that is deferred every time starves the tail; nothing reports a pass that hit its ceiling
- **Where:** `lib/take_down.ts:79` and `:107`.
- **Scenario:** a deferred row is retried first on every pass, because the ordering is by id and not by last try. With 100 or more persistently deferred sessions or identities, the 101st is never reached. Nothing records that `unfrozen.length === 100` or `left.length === 100`.
- **Fix:** order by a last-attempt marker, or key past the last id as identity_sweeper.ts does (`after`, :128-130). The O1 gauges would expose the backlog.

## O6. Minor. Log volume and content of the job's `warn` lines
- **Where:** `lib/take_down.ts:92` `{ session: id }` and `:124` `{ identity: id }`.
- **Volume:** one line per stuck row per minute, up to 200 a minute at the two `LIMIT 100`s. `warn` is copied to object storage one object per line (lib/log.ts header, `PERSISTED_LEVELS`), so one stuck row adds 1,440 stored objects a day.
- **Content:** the lines carry no error `code` or `attempt`, so a 55P03 cannot be told apart from a 57014 or a 40P01 exhaustion. Panel 4 K5 point 3 asked for both, and they were not added.
- **Personal data:** raw session and identity UUIDs go into persisted logs. These are pseudonymous, not addresses, and similar to existing lines. No IP or e-mail address was found in the new log lines.
- **Fix:** add `code` and `attempt`, and log once per identity per hour, or at `info` after the first time. Let the O1 gauge carry the signal.

## O7. Minor. The given-up gauge is a filtered full scan of `dsa_notices` on every scrape, on every node, and it goes stale on a DB error
- **Where:**
  - `lib/queue_metrics.ts:139-145`: the query runs every 15 s (prometheus.yml:8) on each node.
  - The predicate is in `lib/notice_notify.ts:255-257`.
  - The only indexes on `dsa_notices` are `(status, created_at)`, `(created_at)` and `receipt_hash` (db/005:53-58, db/052:10). None covers `decision_sent_at IS NULL`.
  - When `query` returns `null` (db.ts:117-123), the function returns without touching the gauge, so the last value is republished.
- **Effect:**
  - Cost grows with the notice history, which is retained.
  - During a database error, a node keeps exporting the last value. If that was 0, a letter given up during the outage is not shown until the DB answers. The alert uses `max()` across nodes (alerts.yml:210), so any one node with a fresh value fires it.
- **Fix:**
  - Add a partial index `ON dsa_notices (decision_attempts) WHERE decided_at IS NOT NULL AND decision_sent_at IS NULL AND notifier_email IS NOT NULL`.
  - On `rows === null`, call `clearGauge("relay_dsa_decision_letters_given_up")`, so the series is absent rather than stale. The existing `absent`/scrape alerts then take over.

## O8. Minor. The old `relay_dsa_decision_letter_total{result="exhausted"}` is still incremented, and no alert uses it any more
- **Where:** `lib/notice_notify.ts:248` still increments it. `alerts.yml:210` moved to the gauge.
- **Effect:** harmless. Two numbers now describe the same event, and they disagree after a restart or a node death (the O3 reason of panel 3).
- **Fix:** keep it for the dashboard, and say in `watchdogs_*` that the alert reads the gauge only. Or remove the label.

## O9. Checked, no defect found (reading only, not exercised)
- **Counting after COMMIT:**
  - `Freezes` (sessions.ts) is `.then(freezes.count)` on every freezing transaction: identity.ts claimRecovery, vaultShare, changePin, closeOnce (:1165-1167); transfer.ts createInvite and approveInvite; take_down.ts:88.
  - identity_sweeper counts after the batch transaction (:252, :401-402); profile.ts:220.
  - A rolled-back transaction rejects before `.then`, so nothing is counted for it.
- **Double counting on retry:**
  - closeOnce builds a `Freezes` and `chatsEnded` per attempt (identity.ts:1080-1085).
  - The savepoint freeze gets its own `Freezes` and is `take()`n only after release (pin_attempts.ts:130-132).
  - takeDownLive increments nothing.
  - No double count was found.
  - Remaining in-transaction counters, such as `meter("wrong_pin")` in checkPin, are the "last before return" class that sessions.ts's Freezes comment accepts on purpose.
- **Zero initialisation:**
  - `relay_sessions_frozen_total{reason="pin_limit"}` is created at 0 (sessions.ts:34) for SessionFreezeBurst (alerts.yml:121).
  - `relay_identity_sweeper_skipped_total` has all 4 reasons at 0 (identity_sweeper.ts:41).
  - The given-up gauge is set from the first successful scrape.
  - `relay_vault_shares_burned_total` has no zero series, and no alert reads it. Acceptable.
- **Label cardinality:** new labels are fixed enums only: `reason` ∈ {transfer, closed, pin_limit}, `by` ∈ {closed, term, hand}, `result`. The IPv6 /64 fold (rate_limit.ts:403-425) affects only in-memory bucket keys, which it *reduces*. It adds no metric label.
- **Alerts against metrics:**
  - Every metric in an `expr` touched by the range exists in code: `relay_dsa_decision_letters_given_up`, `relay_sessions_frozen_total{reason="pin_limit"}`, `relay_transfer_total{result="wrong_pin"}`, and `relay_vault_share_total`, `relay_vault_pin_total` and `relay_identity_close_total` with `result="wrong"`.
  - The TransferPinGuessing description now points at SessionFreezeBurst, which exists.
- **Remaining raw savepoint:** `identity_sweeper.ts:193-214` still uses a hand-written `SAVEPOINT`. The statements inside it are `SKIP LOCKED` selects, which do not fail on a lock, and the rollback there is JavaScript-driven. So the B69 trap (a *failed statement* rejects the whole `sql.begin`) does not apply. A 57014 inside it would abort the batch, and that is the intended outcome.
- **UNVERIFIED-GAP:** that `scope.savepoint` keeps the outer `sql.begin` alive after 55P03/57014 is claimed by B69's measurement and by `test/pin_limit_rollback.test.ts`. This lens ran neither. The alert unit tests (`alerts.test.yml`) were not run through promtool by this lens.


## Сырьё: линза «Согласованность»

# Consistency lens — day58 60590aa..4746de9 (B63–B79, B70)

Worktree: /home/eugene-panov/Projects/panov-id/xor.ad/.claude/worktrees/par-B83. Read-only.

Commands I ran for numbers and checks:
- `bash scripts/count-tests.sh --check` → `relay/node/test 658`, `итого 705`; two mismatches against the map (640 / 687), exit 1.
- `bash scripts/check-facts-open.sh` → `✗ mail.fallback.transport: адрес говорит строка 191, а якорь стоит на 192 — docs/watchdogs_RU.md`, 1 mismatch.
- `bash scripts/check-facts-limits.sh` → 476 checks, all numbers match (exit 0).
- `bash scripts/check-facts-decisions.sh` → 184 decisions, dates match.
- `bash scripts/check-docs-pairing-all.sh` → xor.ad 73 pairs, numbers match.
- `bash scripts/check-facts-coverage.sh` → nothing uncovered.
- `scratchpad/panel5/count_tests.sh` (`git grep -c 'Deno.test('`): 477 at 60590aa, 486 at 90439e3, 502 at 4746de9. That is +16 plain `Deno.test(` calls after the commit that last counted the map.

---

## C1 — The test map's counts are stale: 640/687 stated, 658/705 counted — contradiction (docs vs repo), found
- `docs/test-map_RU.md:38` and `docs/test-map_EN.md` (the `relay/node/test` row) say **640**. The **Total/Итого** row says **687**. Commit 90439e3 set these numbers, and B68, B70, B75, B76, B78 and B79 added 18 node cases after it.
- `scripts/count-tests.sh --check` goes red (exit 1). If `--check` runs as a gate anywhere, it fails on this tree.
- None of the new suites or cases appears in either map. grep for `pin_limit_rollback`, `batch_counts`, `take_down_own_expired`, `expired_take_down`, `/64`, "before its freeze is written", "writes to support as a frozen one" and "opens no room" in both `docs/test-map_*` finds nothing. Unmapped behaviours:
  - B70: the tenth miss stands against 55P03 and 40P01 (4 cases in `relay/node/test/pin_limit_rollback.test.ts:222,240,256,296`).
  - B75: a locked PIN is refused before the freeze (`identity_routes.test.ts`).
  - B78: a ticket bought before the lock opens no room (`session_freeze.test.ts`).
  - B79: support and last_seen for a locked session.
  - B76: the /64 bucket (`rate_limit.test.ts:169`).
  - B68: the batch counts (`batch_counts.test.ts`).
- Fix: rerun `scripts/count-tests.sh`, set 658/705 in both halves, and extend the Total prose breakdown. Add rows (or extend 3.3a, 3.9, 2.4, and the limits section) for B70, B75, B76, B78 and B79.

## C2 — Test map row 2.4 still says the socket half is untestable — contradiction, found
- `docs/test-map_RU.md:76` (and its EN twin) says: "WS нечем, сокетов нет (G14, G15)".
- The range adds a socket-side case, `relay/node/test/session_freeze.test.ts` "a ticket bought before the PIN was locked opens no room, and says no more than a bad ticket" (B78). `session_freeze.test.ts:88` already checks the `session_frozen` announcement.
- Fix: change the status to include the ticket and NOTIFY cases, and keep "partial" only for what is still unexercised (a socket that is already open).

## C3 — Spec §8.2 heading still promises "in the same transaction" while the new paragraph says it may not be — contradiction (spec internal / spec vs code), found
- `docs/chat_RU.md:1301` opens: "**Десятая ошибка в той же транзакции ставит сессии … `frozen_at`**". Further on it says: "**В той же транзакции заморозка снимает живое**". `docs/chat_EN.md:1318` says the same in English.
- The B75 paragraph appended to the same line says: "Заморозка и снятие живого берут строки, которые может держать чужая транзакция, и тогда их доводит минутная задача `take_down_pin_limit`".
- The code does the latter. `relay/node/src/lib/pin_attempts.ts:128-146`: the freeze runs under `savepoint()`, and on 55P03, 57014 or 40P01 it is dropped (`frozen=false`, no take-down). `take_down.ts:47-58` returns `false` on a timeout.
- The spec now does describe the deferral (question 2 of the brief: yes, it does), but its two bold headings still state the old rule as absolute. A reader who stops at a heading gets the wrong rule.
- Fix: add "(либо, если строку держат, минутной задачей — см. ниже)" / "(or, when the row is held, by the minute's job — below)" to both bold sentences in both halves.
- Minor internal tension in the same paragraph: "до минутной задачи уже открытый сокет живёт, пока задача не заморозит сессию", followed by "минутой она не ограничена: строку сессии можно держать". The socket lives until the freeze lands, however many minutes that takes. Say "until the freeze is written" rather than "until the minute's job".

## C4 — `pin_attempts.ts` opening comment says freeze and lock are "one write or they are a hole" — contradiction (comment vs code), found
- `relay/node/src/lib/pin_attempts.ts:91-98`: "The same transaction freezes the session … Closing the PIN alone leaves exactly that open, so the two are one write or they are a hole."
- Lines 112-135 of the same file (B59, B70) make the freeze separable: the PIN locks and the freeze may roll back to its savepoint. The hole is closed by a different mechanism, the guard treating `locked_at` as frozen (`lib/identity_guard.ts:135-144`, B75). The comment does not mention it.
- Fix: rewrite the first paragraph. The lock is written here unconditionally; the freeze is attempted in a savepoint; until it lands, `identity_guard.ts` refuses the locked share as frozen (B75), and `take_down_pin_limit` writes it.

## C5 — `db.ts` says "never a hand-written SAVEPOINT"; `identity_sweeper.ts` still uses three — contradiction (comment vs code), found; not a functional defect
- `relay/node/src/lib/db.ts:145`: "Through postgres.js's own savepoint, never a hand-written SAVEPOINT".
- `relay/node/src/lib/identity_sweeper.ts:193,208,213-214` use `SAVEPOINT sweep_shares` / `RELEASE` / `ROLLBACK TO SAVEPOINT` by hand inside `transaction()`.
- It works because no statement fails before the rollback (SKIP LOCKED; the rollback is chosen in JS). Panel 4 says so itself (`docs/reviews/PANEL_2026-09-26_day58-artel-4.md:515-518`), but no comment in the code does.
- `relay/node/src/lib/sessions.ts:52` also still says "a freeze undone by ROLLBACK TO SAVEPOINT". That is conceptually right, but it names the mechanism the codebase now forbids.
- Fix, one of two:
  - Narrow `db.ts:145` to "never a hand-written SAVEPOINT around a statement that may fail (identity_sweeper.ts's is rolled back from JS, never after an error)".
  - Or move the sweeper onto `savepoint()`.

## C6 — The DSA spec still says the counter raises `DsaDecisionLetterExhausted`; after B63 the gauge does — contradiction (spec vs code), found
- `docs/dsa/SPEC_RU.md:440` and `docs/dsa/SPEC_EN.md:460`: "исчерпанное считается как `relay_dsa_decision_letter_total{result="exhausted"}` и поднимает тревогу `DsaDecisionLetterExhausted`".
- The code: `relay/local/observability/alerts.yml:210` `expr: max(relay_dsa_decision_letters_given_up) > 0`, a gauge computed from rows (`lib/queue_metrics.ts` `collectDecisionLetters`, `lib/notice_notify.ts` `DECISION_LETTER_GIVEN_UP`).
- The code also now ends the lease at once when a letter is exhausted (`notice_notify.ts` CASE on `$3 >= $5`). The spec does not say so.
- `docs/watchdogs_*` was updated in 90439e3; the DSA spec pair was not.
- `docs/test-map_RU.md:490` / `_EN.md:506` (row 26.8) also names only the counter. The B63 cases ("a decision letter given up stays counted until it is marked sent", "a node that died holding the last try…", "a decision with no text … on the gauge", `dsa_decision_letter.test.ts`) are not listed.
- Fix: in both halves of the DSA spec, the alert reads `relay_dsa_decision_letters_given_up`, a gauge over `dsa_notices` held until `decision_sent_at`; the counter remains a counter. Add the three cases to row 26.8.

## C7 — `open.tsv` anchor broken by the B75 watchdogs bullet — contradiction (registry vs doc), found, checker red
- Commit 2a27a94 inserted a line into `docs/watchdogs_RU.md` (line 188, the `take_down_pin_limit` bullet). The `mail.fallback.transport` anchor moved from 191 to 192, and `docs/facts/open.tsv:150` still points at 191.
- `scripts/check-facts-open.sh` → "РАСХОЖДЕНИЙ: 1".
- Fix: update the line in `open.tsv:150`. The EN half moved too (`docs/watchdogs_EN.md:198`); check whether open.tsv carries an EN address.

## C8 — Quorum decisions B75 and B76 have no row in `docs/facts/decisions.tsv` — minor (registry gap), found
- Two decisions are marked "решено кворумом":
  - `docs/chat_RU.md:1301` / `docs/chat_EN.md:1318`: "Запертый ПИН — уже заморозка … решено кворумом 26.09.2026 (панель 4, К4; B75)".
  - `docs/protocol_RU.md:417` / `docs/protocol_EN.md:428`: "/64 … решено 26.09.2026 кворумом 3:0, B76".
- `grep -n "B75\|B76\|/64" docs/facts/decisions.tsv` → nothing. The last 26.09 row is `chat.2026-09-26.takedownexpired`.
- Panel 4 already listed B58, B51 and B59 as missing from the registry (`PANEL_…-artel-4.md:316`); they are still missing.
- `check-facts-coverage.sh` stays green, so the gate does not see this class. That is a gap in the gate, marked UNVERIFIED-GAP: I did not read how coverage chooses what to require.
- Fix: add `chat.2026-09-26.pinlockedisfrozen` and `protocol.2026-09-26.ipv6slash64` rows anchored on both halves, plus B58, B51 and B59.

## C9 — "Live session" now means two things — contradiction (spec vs code), found
- The spec defines it as `frozen_at` empty: `docs/chat_RU.md:874` (EN :883 region), "Живая сессия — та, у которой `frozen_at` пуст".
- `relay/node/src/routes/support.ts:96-97` (B79) counts as live only sessions with `frozen_at IS NULL AND NOT EXISTS (… locked_at IS NOT NULL)`.
- `relay/node/src/lib/identity_guard.ts:188` (B79) also stops `last_seen_at` for a locked share. The spec's "страж узла не пишет ей `last_seen_at`" names only the frozen session.
- Other places still use the plain `frozen_at IS NULL` definition: `lib/identity_sweeper.ts:334`, `take_down.ts:100`, `sessions.ts` `frameSessions`, `chats.ts:88`, `away_waker.ts:24`. That is mostly harmless because the guard refuses such a session anyway, but it is two definitions of one word.
- Fix: in both halves of the year paragraph, "живая — `frozen_at` пуст и доля не заперта (B79)".

## C10 — The watchdogs doc says the job's counter "comes after B70"; B70 has landed and nothing tracks the counter — minor, found
- `docs/watchdogs_RU.md:189` / `docs/watchdogs_EN.md:195`: "счётчик с тревогой — после B70 (панель 4, К5)".
- B70 is a3d02de, inside the range. No `relay_take_down_pin_limit_total` exists (`grep -rn take_down_pin_limit relay/node/src relay/local` shows only the job name and comments).
- The sibling bullets name an `open.tsv` id (`watchdogs.unbuilt`, `mail.fallback.transport`). This one names only a panel letter, and `open.tsv` has no item (`grep -n "take_down\|pin_limit" docs/facts/open.tsv` → nothing).
- Fix: open an `open.tsv` item (e.g. `watchdogs.takedown.pinlimit`, panel 4 Н4) and cite it in both halves in place of "после B70".

## C11 — `deno.json` `//test` note says "the ten suites that need Postgres"; the list is 19 — minor, found (predates the range, but the range added 4 more to the same line)
- `relay/node/deno.json:6`: "Everything but the ten suites that need Postgres".
- The `--ignore` list on :7 has 19 files (`grep -o "test/[a-z_]*\.test\.ts" | wc -l` → 19). 19 test files carry "DATABASE_URL is not set".
- Fix: say "the suites that need Postgres" without a number, or say 19.

## C12 — `sessions.ts` header describes a relay that does not listen — minor, found (header untouched, file changed in range)
- `relay/node/src/lib/sessions.ts:20-23`: "Nothing listens yet. The chat relay is a stub (src/chat/relay.ts)…".
- `relay/node/src/chat/relay.ts:104-108` listens on `session_frozen`, and B78 edited that file in this range.
- Also ":25-26 there are three callers to come". Freezes now has many callers: routes/identity.ts ×3, transfer.ts ×2, take_down.ts, pin_attempts.ts, and the sweeper by SQL.
- Fix: rewrite that paragraph.

## C13 — The `Freezes` comment's "About fifty-five such places" — UNVERIFIED-GAP
- `relay/node/src/lib/sessions.ts:64` makes a numeric claim with no command behind it. I did not recount. Per rule 14 it needs a grep that produces it, or it should be dropped.

---

### Checked and consistent (no finding)
- **Code comments on B70:**
  - `take_down.ts:34-46`: the 55P03 and 57014 give-up and the 40P01 retry match the code at :52-56.
  - The second loop at :117-126 matches the "(B70)" comment.
  - `scheduled.ts:115` "(B51, B59)" is accurate.
- **B59 test removal:** `identity_routes.test.ts:815-819` explains it, and `pin_limit_rollback.test.ts:15-20` points back to it. No doc references the removed case name: grep "cannot take its row in time" matches only the panel log, which records a historical run.
- **Test names checked against their bodies:** `pin_limit_rollback.test.ts` (4 cases), `identity_routes.test.ts:743` ("a take-down raced every time…"). Each asserts what its name says, with a witness that the waiting statement was the one under test.
- **Limits:** `transfer.claim.hour`=10 and `.day`=30 (`rate_limit.ts:235-236`), `claim.miss.shared`=50 and `claim.miss.pause`=15 (`recovery_misses.ts` = RECOVERY), `limits.tsv:98,99,106,107`, and the openapi 429 text (`docs/api/openapi.yaml:1696`) plus `index_RU/EN.html` all agree. `check-facts-limits.sh` is green.
- **Stale "60 an hour":** only past-tense history remains (`rate_limit.ts:228,240`, `transfer.ts:261`).
- **B76 wording:** the /64 paragraph sits in §5 of both protocol halves (RU :417, EN :428), matching the `limits.tsv` header note. The wording matches the `bucketAddress` comment (the logged address is unchanged; a /48 host gets one bucket per /64). Test addresses are IPv4, so no DB suite silently shares a bucket.
- **RU/EN pairs changed in the range** (chat §8.2 and §8.4, protocol §5, watchdogs, test-map, api index) carry the same facts and numbers. `check-docs-pairing-all.sh` is green.
- **Alerts:** the `alerts.test.yml` descriptions match `alerts.yml` for TransferPinGuessing and DsaDecisionLetterExhausted.


## Опровержение: код (S1–S5, D1–D9, O3, O4) — сырьё

# Refuter (code) — panel 5, xor.ad day58 = 4746de9 (range 60590aa..4746de9)

Everything below was judged against day58 in the worktree `par-B83` of the repository `xor.ad`, under `relay/node/src`.

- **Exercised:** one run of `bucketAddress` from day58 in a throwaway `denoland/deno` container (`scratchpad/refute/p64.sh`, `--rm`, nothing left behind).
- **Everything else:** decided by reading the code at the lines cited.
- **Not re-measured by me:** the Postgres/postgres.js behaviour in E3 and E7. Those are the data lens's own measurements, and they are marked where they are used.

| # | Finding | Verdict | Level |
|---|---|---|---|
| 1 | S1 no notify after deferred freeze | CONFIRMED | contradiction (spec) / design defect |
| 2 | S2+D6 re-checks test only frozen_at | PARTLY | minor (race) |
| 3 | S3 only three SQLSTATEs caught | REFUTED as reachable | — (hardening only) |
| 4 | S4/P1/P2 hex-mapped fold, /48 | PARTLY | minor (no source emits the form) |
| 5 | S5+D1 savepoint query fn outlives scope | REFUTED as a live defect | — (hazard, no call site) |
| 6 | D2 40P01 retry makes consent the victim | PARTLY | contradiction (test comment), impact nil |
| 7 | D3 40P01 test passes either way | CONFIRMED (by reading) | minor (test strength) |
| 8 | D4/O4 job freeze loop has no lock_timeout | PARTLY | minor |
| 9 | O3 other errors drop the whole pass | PARTLY | minor |
| 10 | D8 closeIdentities stop test ignores unlinked | PARTLY | minor (practically unreachable) |
| 11 | D9 profile DB failure 500 not 503 | CONFIRMED | minor |

---

## 1. S1 — CONFIRMED. Level: contradiction in the spec, and a design defect

**The chain holds in code:**

- **Freeze fails, notify goes with it.** `lib/pin_attempts.ts:130-137`: the freeze runs in a savepoint, and 55P03/57014/40P01 are swallowed. The only `pg_notify('session_frozen')` is inside `freezeSession` (`lib/sessions.ts:137`), so it rolls back with the savepoint.
- **No take-down either.** `pin_attempts.ts:145` skips the in-place take-down when `frozen` is false.
- **Rooms close only on that notify.** `chat/relay.ts:108-111` tears rooms only on the notify.
- **Nothing else stops delivery to an open room.**
  - `pendingFor` (`chat/relay.ts:50-65`) checks only `stepped_away_until`. It has no frozen or locked check.
  - `routes/chats.ts:87-89` queues deliveries for any recipient session with `frozen_at IS NULL`.
  - The only `locked_at` check in `chat/` is the ticket at `relay.ts:260`, and that runs only when a room is opened.
- **How long it lasts.** Until `takeDownLeftByPinLimit` writes the freeze (`lib/take_down.ts:81-94`). That loop has no lock timeout and defers on the same three codes.

**The spec contradicts itself.** `docs/chat_RU.md:1301` does name this price: "до минутной задачи уже открытый сокет живёт". The same paragraph rejects "окно до минуты" because "минутой она не ограничена: строку сессии можно держать". Both statements apply to the same socket.

**Honest bound on the risk:**

- Keeping the window open needs the session row held against a 2 s wait (close route) or a 15 s wait (other routes and the job) at every attempt.
- A thief holding the tab can hold that row only through their own in-flight requests, each bounded by `statement_timeout` (15 s, `lib/db.ts:54-57`).
- So this is hard to sustain, but it is not bounded by design.

**Fix status.** B72, which adds `pg_notify` in the freeze's catch, is unmerged. day58 does not have it.

## 2. S2 + D6 — PARTLY. Level: minor (race window)

**The code is as described.** Each re-check tests only `frozen_at`:
- `routes/matches.ts:151-153`
- `routes/identity.ts:870-872`
- `routes/transfer.ts:427-428`

`routes/support.ts:65` takes `frozen` from the guard's read, made before the transaction starts.

**What narrows it:**

- **The same device.** Only one live session per identity is possible (db/022 partial unique index). So a consent or a vault init racing the tenth miss comes from that same tab.
- **The freeze must also be deferred.** The window needs item 1's deferred freeze, not just a concurrent request.
- **`transfer.ts:427` is moot.** It needs a claimed invite from a PIN-checked `createInvite`. The finding concedes this.
- **`identity.ts:871` (vault init) is moot in practice.** It needs a live `first_pin_grant`, and that exists only on the paper-code or new-device path, not on a PIN-locked tab.
- **A consent's half is not undone later.** `freezeSession` takes halves back only for `reason === "transfer"` (`lib/sessions.ts:113`), not for `pin_limit`. `takeDownLive` later expires only matches with `chat_id IS NULL`. So if the other side had already consented, a chat that the racing consent opened stands.
- **Support.** One request is written as live (`from_frozen = false`) and is bounded by `PER_DAY`. That part is confirmed.

**Verdict:** real, narrow, same-tab only. Minor.

## 3. S3 — REFUTED as a reachable defect. Hardening only

**The code does catch only three codes:** `pin_attempts.ts:136` and `take_down.ts:53-56`. I looked for any other SQLSTATE the savepoint bodies could raise:

- **No triggers or deferred constraints.** `grep -rniE "create (constraint )?trigger|deferrable" relay/node/db` finds none on these tables.
- **The CHECKs are not hit.** The only CHECKs are on `identities` and preferences columns. `freezeSession(pin_limit)` writes only `sessions.frozen_at` / `frozen_reason`.
- **FKs** are ON DELETE CASCADE only (security lens; not re-grepped by me).
- **54000 from `pg_notify`** needs the 8 GB NOTIFY queue to fill behind a stuck listener. The only listener is the node's own `listen()` connection. That is not attacker-steerable and not realistic.
- **Class 08 (lost connection)** would roll everything back whatever the catch says.

No reachable path found.

## 4. S4 / P1 / P2 — PARTLY. Level: minor (hardening, no current source)

**The mechanics are exercised.** Running day58 `bucketAddress` in Deno gave:

```
::ffff:c000:280 -> 0:0:0:0::/64
::ffff:c000:281 -> 0:0:0:0::/64
::ffff:192.0.2.128 -> ::ffff:192.0.2.128
192.0.2.128 -> 192.0.2.128
2001:db8:1:2::1 -> 2001:db8:1:2::/64
```

So a hex-spelled mapped address does fold into one bucket, and the dotted spelling is kept whole (P2a).

**No address source produces the hex form (`lib/client_ip.ts`):**

| Source | Where | Can it produce the hex form? |
|---|---|---|
| Deno socket | `main.ts:38` listens on `0.0.0.0`, so `remoteAddr` is IPv4 only | No |
| Caddy `X-Forwarded-For` | `:66-77`, last entry | Go prints v4-mapped addresses dotted (`net.IP.String` gives plain IPv4; `netip` gives `::ffff:a.b.c.d`). Not measured by me |
| `x-client-ip`, `x-real-ip`, first XFF | `:40-55` | Trusted only with the secret `x-origin-token`, so an attacker cannot choose the spelling. What Bunny writes is UNVERIFIED (the lens reports did not check it either) |

**The /48 point stands** as a documented residual. It is not a regression (the old key was per /128).

**Verdict:** the mechanism is real; no current trigger was found.

## 5. S5 + D1 — REFUTED as a live defect. Hazard only

- **Only two call sites:** `grep -rn "savepoint(" src` finds `lib/pin_attempts.ts:131` and `lib/take_down.ts:50`.
- **Neither leaks `inner`.** `freezeSession` (`lib/sessions.ts:96-150`) awaits every `run`: grep for `run` without `await` finds only parameter lines. `takeDownLive` (`take_down.ts:133-228`) likewise awaits every statement and stores no closure.
- **The postgres.js behaviour** is data lens E3. I did not re-measure it; NOT VERIFIED by me.

No current path.

## 6. D2 — PARTLY. Level: contradiction (test comment), impact nil. The "design defect" framing is REFUTED

**Confirmed:**
- **No retry in the consent route.** `routes/matches.ts:236-240` turns any error into 503. `tryAgain` exists only in `routes/away.ts:49-60`.
- **The test comment says otherwise.** `test/pin_limit_rollback.test.ts:265` claims the consent's route "tries again (routes/matches.ts)". That is false.

**Refutes the impact:**

- **Only the same session can be in this deadlock.** The cycle needs the consent to wait on the *same* session row the tenth miss froze (`matches.ts:151`: `FOR SHARE` on `caller.sessionId`). With one live session per identity, that consent comes from the very tab making the tenth miss.
- **The other participant cannot enter the cycle.** Its consent locks both counters and then its *own* session, which the miss does not hold. The miss just waits on the counters for 2 s and returns false on 55P03 (`take_down.ts:55`).
- **The 503 goes to a request that loses nothing.** The only request answered 503 is the locking tab's own consent. A moment later that consent would be refused 401 anyway (`identity_guard.ts:144`).
- **The E7 timings are data lens's.** NOT re-measured by me.

**Fix:** correct the test comment, or choose option (b).

## 7. D3 — CONFIRMED by reading. Not exercised. Level: minor (test strength)

The assertion at `test/pin_limit_rollback.test.ts:287` is `holderGotSession || holderLost === "40P01"`. It admits both outcomes on purpose.

Walking through `continue` changed to `return false` at `take_down.ts:54`:

1. The first 40P01 rolls back only the take-down's savepoint. The freeze's savepoint s0 was not rolled back, so the session lock stays.
2. The miss commits: counted, `pin_limit` freeze, one freeze counted.
3. The holder then gets the session, so `holderGotSession` is true.
4. `takeDownLeftByPinLimit()` clears the phrase.

Every assertion stays green. I did not break the code and run the suite; it is READ-ONLY here.

## 8. D4 / O4 — PARTLY. Level: minor

**Confirmed in code:**

- **No lock timeout in the job's freeze loop.** `take_down.ts:84-88` runs `FOR UPDATE` on `vault_shares` and the `UPDATE sessions` in `freezeSession` without one.
- **Timeouts:** `statement_timeout` is 15 s (`lib/db.ts:56`), and the lease is 10 min (`lib/jobs.ts:19`).
- **Only one route sets a lock timeout.** `grep lock_timeout routes lib` shows it only at `identity.ts:1098` (close), `matches.ts:83`, `likes.ts:110/291` and `take_down.ts:146`. The `checkPin` callers at `identity.ts:792/991` and `transfer.ts:135` have none, so the route half of O4 (a tenth miss on `/vault/share` waiting up to 15 s) is true at day58. B81, unmerged, adds 2 s.

**Refutes the severity:**

- **The overrun is impractical.** Passing the 10-minute lease takes more than 40 sessions, each locked-but-unfrozen *and* with its row held for about 15 s at the moment the job reaches it. Every holder is itself bounded by `statement_timeout`.
- **A parallel pass is harmless.**
  - The freeze is idempotent (`WHERE frozen_at IS NULL` in `sessions.ts:125-128`, and the share is re-read under `FOR UPDATE`).
  - `takeDownLive` is idempotent.
  - Two passes serialize on the row locks.

**Verdict:** latency and pool pressure only.

## 9. O3 — PARTLY. Level: minor

**True:** `take_down.ts:91` and `:122` rethrow anything other than 55P03/57014/40P01 (and TakeDownRetry), which ends the pass.

**No deterministic per-row non-lock error was found** for either body (same search as item 3): no triggers, no deferred constraints, and no CHECK on the columns written.

- A class 08 error should end the pass anyway.
- The "one poisoned identity starves the rest" scenario needs an error source that does not exist today.

**Verdict:** robustness hardening, not a live defect.

## 10. D8 — PARTLY. Level: minor (practically unreachable)

**True:** `lib/identity_sweeper.ts:401` breaks on `frozen + burned + faces === 0`. It ignores the `unlinked` CTE (`:367-372`), while the pick at `:339` selects identities whose only remaining work is a `support_requests` link.

**Refutes reachability:**

- **Closing already unlinks.** `closeOnce` itself unlinks: `routes/identity.ts:1162`, `UPDATE support_requests SET identity = NULL`.
- **Nothing links a support row after the close.** A closed identity's session is frozen with reason `closed`, and `support.ts` refuses a `closed` or `transfer` freeze.
- **What is left is legacy.** Only rows linked before `:1162` existed, and closed within `DELETION_DELAY_DAYS`, could be in the only-unlinked state.
- **The batch is 2000, so the stall is tiny.** A stall needs a batch made up entirely of such identities, with more behind it. Those picked are unlinked and never picked again, so the next hourly pass goes on.

## 11. D9 — CONFIRMED. Level: minor (pre-existing, now pinned by a test)

- **The 503 line is dead code.** `routes/profile.ts:105` calls `transaction(...)` with no `.catch`. `answer` is therefore a Response or a throw, and `?? refuse(..., 503)` at `:221` never runs.
- **The throw becomes a 500.** `src/dispatch.ts:121-133` turns it into `{"error":"internal"}` 500.
- **The test pins that.** `test/expired_take_down.test.ts:225-226` asserts that the call *throws* (`refused.includes("b77: refused on cue")`).
- **The trigger is realistic.** A 57014, or a lost connection on this route, answers 500 instead of 503.


## Опровержение: документы и эксплуатация (O1, P3–P6, C3, C4, C6, C8, C9, C10) — сырьё

# Опровержение, панель 5 — документы, протокол, эксплуатация

Репозиторий xor.ad, worktree par-B83, HEAD 4746de9 (day58), диапазон 60590aa..4746de9. Только чтение.

Итог: CONFIRMED 5 (P5 частично, C3, C6, C8, C9 мелочь); PARTLY(known) 4 (1, P3, P4, P6); PARTLY/стоит понизить 1 (C4).

---

## 1. O1 + O2 + C10 — нет счётчика и тревоги для «отложено»
**Вердикт: PARTLY (известно).**
- Известно с панели 4: `docs/reviews/PANEL_2026-09-26_day58-artel-4.md:573` (К5) и `:620` (Н4, «счётчик `relay_take_down_pin_limit_total{result}`… тревога… после B70»).
- Задача уже сделана как B74: `/home/eugene-panov/Projects/panov-id/.parallel/xor.ad/tasks.tsv` — `B74 done … 83e5983 … панель-4 Н4 (К5 К12)`. Коммит 83e5983 добавляет счётчик `relay_take_down_pin_limit_total{result}` (frozen, freeze_deferred, taken, deferred, raised), `code` в строке warn и тревогу `TakeDownPinLimitDeferred` (`git show --stat 83e5983`: take_down.ts, alerts.yml, alerts.test.yml, тест).
- Но в day58 он **не влит**: `git merge-base --is-ancestor 83e5983 HEAD` → `B74-NOT-IN`; `grep -rn relay_take_down_pin_limit relay/` в HEAD ничего не находит.
- Что остаётся верным (новое):
  - (а) Строки `docs/watchdogs_RU.md:190` и `_EN.md:196` верны для HEAD («счётчик — после B70»), но устареют, когда B74 вольют. 83e5983 не трогает watchdogs: документ нужно править вместе с влитием B74.
  - (б) В `open.tsv` пункта нет, но задача ведётся на доске артели, так что это не потеря.
- Уровень: не новая находка. Остаток — «влить B74 и обновить watchdogs:190/196», мелочь.

## 2. P3 — 401 вместо 409 pin_locked после B75
**Вердикт: PARTLY. Как регрессия B75 опровергнуто; пробел в документах старый.**
- До B75 страж был таким: `if (row.frozen_at && !options.allowFrozen) return unauthorized();` (`git show 2a27a94 -- identity_guard.ts`). Десятая ошибка и раньше замораживала сессию в той же транзакции, поэтому следующие вызовы на обычном пути и раньше получали 401. B75 лишь распространил это на редкий случай, когда заморозка отложена.
- Ответ на саму десятую ошибку не изменился: `pin_attempts.ts:157` → `409 pin_locked`. Страж отрабатывает до записи `locked_at`. Поэтому depth (`depth/ink/move.ts:30`, `rooms.ts:1104`) по-прежнему видит `pin_locked` там же, где видел.
- Ветка `pin_attempts.ts:67-73` (`locked_at` → 409) и до B75 была достижима только маршрутом с `allowFrozen` (`identity.ts:494`, это recovery/claim, ПИН там не проверяется).
- Что верно: описание `Unauthorized` (`docs/api/openapi.yaml:798-802`) называет только подпись и не называет замороженную или запертую сессию. В `protocol_RU.md` 401 для замороженной сессии упомянут только у `/identities/close` (:136). Пробел существует со дня введения заморозки (14.09), а не появился в диапазоне.
- Уровень: мелочь, документ. Не новое от B75.

## 3. P4 — общая пауза узла отвечает 429, как предел адреса
**Вердикт: PARTLY (известно, старше диапазона).**
- Код `transfer.ts:174-179` из e7fd7613 от 21.09, это до диапазона (`git blame`). Та же схема стоит у двух других тормозов: `identity.ts:472`, `:1228`, везде `429 rate_limited` с `Retry-After`. Это единое решение, а не случайность в диапазоне.
- Ответы различаются текстом («transfer codes are not being accepted right now» против «too many attempts from this address») и меткой (`paused` против `address_limited`). openapi `/sessions/claim` `"429"` прямо называет обе причины (`openapi.yaml:1696`).
- Неразличимость на экране уже записана: панель 4, эксплуатация №5 (`PANEL_…-artel-4.md:226`: «Общую паузу узла экран показывает тем же текстом, их не отличить»), задача Н7.
- RFC 6585 §4 не запрещает 429 для ограничения по чему-то, кроме пользователя. Там только SHOULD объяснить условие, и текст это объясняет.
- Уровень: не находка диапазона.

## 4. P5 — ответы /sessions/claim в openapi неполные
**Вердикт: CONFIRMED (частично новое).**
- `docs/api/openapi.yaml:1694-1696`: `"200"` без схемы. `"429"` описан inline, без `headers: Retry-After` и без `content`, хотя готовый `components/responses/RateLimited` (`:808-812`) несёт и то и другое. Этот inline 429 внесён в диапазоне (9c369f6, закрытие К8 панели 4), то есть свежая правка сделана не по шаблону соседних операций.
- Код отвечает ещё 400 (`transfer.ts:171`, `:189-193`), 404 (`:212`), 409 (`:222`), 503 (`:235`). В openapi их нет. Этот пробел старше диапазона: панель 4 видела «один 200» (`PANEL_…-artel-4.md:522`) и завела только 429.
- Уровень: мелочь (документ). Правка: `"429": {$ref: RateLimited}` с сохранением описания плюс BadVersion, NotFound, Conflict, Unavailable.

## 5. P6 — 401 без WWW-Authenticate
**Вердикт: PARTLY (известно).**
- Уже заведено: `docs/reviews/PANEL_2026-09-21_steps1-2.md:173` («ДЕФЕКТ ДИЗАЙНА — 401 без `WWW-Authenticate`… Предложение: `WWW-Authenticate: XorIdentity realm="relay"`») и `:845`.
- В коде по-прежнему нет (`grep -rni www-authenticate relay/node/src` пусто). Дефект старый, в диапазоне не появился.

## 6. C3 — заголовки «в той же транзакции» и цена про сокет
**Вердикт: CONFIRMED.**
- `docs/chat_RU.md:1301` и `docs/chat_EN.md:1318`: жирный заголовок «Десятая ошибка в той же транзакции ставит… `frozen_at`» и «В той же транзакции заморозка снимает живое» стоят без пометки [retired]. Конец того же абзаца (B75) говорит, что заморозку и снятие может доводить минутная задача `take_down_pin_limit`. Абзац противоречит собственным заголовкам.
- Цена. «Окна, в котором вкладка ещё подписывает от имени личности, нет» стоит рядом с «до минутной задачи уже открытый сокет живёт, пока задача не заморозит сессию». Сокет закрывается только по `NOTIFY session_frozen` (`relay/chat/relay.ts:104-111`), а задача замораживает, лишь когда возьмёт строку сессии. Значит, сокет живёт не «до минуты», а пока держат строку. Это ровно тот довод, которым тот же абзац отклоняет «окно до минуты». Новые билеты B78 закрыл (`relay.ts:248-260`), а уже открытая комната остаётся.
- Уровень: противоречие в спеке, мелочь или дефект документа. Правка: заголовки переписать через «заморозка или, если строка занята, минутная задача», а цену сокета назвать без ограничения минутой.

## 7. C6 — dsa/SPEC говорит, что тревогу поднимает счётчик
**Вердикт: CONFIRMED (мелочь).**
- `docs/dsa/SPEC_RU.md:440` и `SPEC_EN.md:460`: «считается как `relay_dsa_decision_letter_total{result="exhausted"}` и поднимает тревогу `DsaDecisionLetterExhausted`».
- `relay/local/observability/alerts.yml:209-210`: `expr: max(relay_dsa_decision_letters_given_up) > 0`, это датчик из `queue_metrics.ts:144`. Тревога держится до отметки `decision_sent_at`.
- Счётчик в коде жив (`notice_notify.ts:248`), поэтому «считается» верно, а неверно только «поднимает». Коммиты 12b02c3 и 90439e3 поправили `watchdogs_RU/EN` (:188/:194), а SPEC не тронули.

## 8. C9 — «живая сессия» определена как `frozen_at IS NULL`
**Вердикт: CONFIRMED (мелочь, смягчено).**
- `docs/chat_RU.md:876`: «Живая сессия — та, у которой `frozen_at` пуст… страж узла не пишет ей `last_seen_at`».
- Код после B75 и B79: `identity_guard.ts:188` (`!row.frozen_at && !row.pin_locked`) не пишет год и запертой; support.ts (d089bc5) считает запертую не живой. d089bc5 документов не менял (`git show --stat d089bc5`: доков нет).
- Смягчение: §8.2 (`chat_RU.md:1301`) теперь говорит «Запертый ПИН — уже заморозка, даже если `frozen_at` не успел записаться», и по смыслу это определение покрывает. Буква :876 и EN-пары устарели.
- Правка: дописать в :876 «или доля заперта (B75)».

## 9. C4 — комментарий «one write or they are a hole»
**Вердикт: PARTLY. Понизить до мелочи, не новое.**
- `pin_attempts.ts:101-108` (dd01b364, 21.09): «the two are one write or they are a hole». Абзац ниже, `:111-119` (1dcd3fdd, до диапазона: `merge-base` → before-range), прямо оговаривает, что откатывается только заморозка, а доводит её минутная задача. Читатель видит поправку через 4 строки.
- После B75 настоящая причина, по которой дыры нет, в том, что страж читает `locked_at` (`identity_guard.ts:144`). В этом комментарии она не названа. Предложение «one write or a hole» устарело с B59.
- Уровень: мелочь, текст комментария, старше диапазона.

## 10. C8 — нет строк B75 и B76 в decisions.tsv
**Вердикт: CONFIRMED (мелочь).**
- Оба решения записаны в доках как решения кворумом: `chat_RU.md:1301` («решено кворумом 26.09.2026 (панель 4, К4; B75)») и `protocol_RU.md:417` («решено 26.09.2026 кворумом 3:0, B76»).
- В `docs/facts/decisions.tsv` строк на них нет. За 26.09 там шесть строк (:189-194): papercode, moveenvelope, movelongkey, reissuewrap, decisionletter, takedownexpired. `grep -n "ipv6\|/64"` пусто.
- Прецедент требует строк: у решений кворумом за 24 и 25.09 они есть (`protocol.2026-09-24.signupappearance` :183, `protocol.2026-09-25.noncebody` :186).
- Правка: две строки `chat.2026-09-26.pinlockedfrozen` и `protocol.2026-09-26.ipv6prefix`, затем `scripts/check-facts-decisions.sh`.


## Сводка ведущего (xor-ad-bf)

Пометки: **ПРОВЕРЕНО** — чем проверил я сам; **НЕ ПРОВЕРЕНО** — заявка линзы и опровергателя, мной не перепроверена. Критичных находок нет.

### Подтвердилось

| # | Находка (линза) | Уровень | Статус проверки |
|---|---|---|---|
| 1 | **S1** — откат заморозки десятого промаха уносит и `pg_notify('session_frozen')`: уже открытые комнаты чата живут и получают реплики до минутной задачи, которая минутой не ограничена; спека `chat_RU.md:1301` противоречит сама себе (Безопасность, подтвердил опровергатель кода) | дефект дизайна / противоречие | **ПРОВЕРЕНО**: `lib/sessions.ts:137` — notify внутри `freezeSession`, которая идёт под `savepoint` (`pin_attempts.ts:131`); `chat/relay.ts:108-111` — комнаты закрываются только по notify; `chat/relay.ts:50-65` — ни одной проверки frozen/locked (grep: 0) |
| 2 | **S2+D6** — перепроверки под замком смотрят только `frozen_at` (`matches.ts:151`, `identity.ts:871`, `transfer.ts:427`, `support.ts:65`); остаток по опровержению: согласие своей же вкладки может открыть беседу, которую `pin_limit`-заморозка не откатывает (`sessions.ts:113`), и одно обращение в поддержку пишется как «живое» (Безопасность, Данные) | мелочь (гонка) | **НЕ ПРОВЕРЕНО** мной, опровергатель — PARTLY по чтению |
| 3 | **S4/P1** — `prefix64` сводит IPv4-mapped в шестнадцатеричной записи (`::ffff:c000:280`) в одну корзину `::/64`; источника такой записи не найдено, что пишет Bunny в `x-client-ip` — не проверено (Протоколы, Безопасность) | мелочь, латентно | **НЕ ПРОВЕРЕНО** мной; прогон линзы и опровергателя в Deno: `::ffff:c000:280 -> 0:0:0:0::/64` |
| 4 | **D2** — комментарий моего теста `pin_limit_rollback.test.ts:265` утверждает, что маршрут согласия повторяет на 40P01; повтора нет (`matches.ts:236-240` → 503). Влияние опровергнуто: дедлок возможен только с согласием той же вкладки (Данные) | противоречие (комментарий теста) | **ПРОВЕРЕНО**: `grep -n "tryAgain\|40P01" src/routes/matches.ts` — пусто |
| 5 | **D3** — тест 40P01 проходит и при повторе, и при `return false` в `take_down.ts:54` (Данные) | мелочь (сила теста) | **НЕ ПРОВЕРЕНО** поломкой; по чтению `:287` принимает оба исхода |
| 6 | **D4/O4** — цикл заморозки минутной задачи (`take_down.ts:84-88`) без `lock_timeout`: до 15 с на строку; маршруты закрывает невлитая B81 (Данные, Эксплуатация). Переход аренды и параллельный проход опровергнуты: нужно >40 удержанных строк, а заморозка идемпотентна | мелочь | **НЕ ПРОВЕРЕНО** мной |
| 7 | **O3** — задача роняет весь проход на ошибке, не являющейся тайм-аутом/дедлоком; источника такой ошибки на строку не найдено (Эксплуатация) | мелочь | **НЕ ПРОВЕРЕНО** |
| 8 | **D9** — `routes/profile.ts:105` без `.catch`: сбой базы даёт 500 вместо 503 на `:221`, и `expired_take_down.test.ts:225-226` закрепляет выброс (Данные) | мелочь | **ПРОВЕРЕНО**: в `profile.ts` единственный `.catch` — `:66` (тело запроса); `:221` — `answer ?? refuse(... 503)` |
| 9 | **P5** — ответы `/sessions/claim` в openapi: встроенный 429 без Retry-After и схемы (добавлен в диапазоне, 9c369f6), нет 400/404/409/503 и схемы 200 (Протоколы) | мелочь | **ПРОВЕРЕНО**: `docs/api/openapi.yaml:1695-1696` — только 200 и встроенный 429 |
| 10 | **C1** — карта тестов 640/687, по счёту 658/705 (Согласованность) | противоречие, ворота красные | **ПРОВЕРЕНО**: `scripts/count-tests.sh --check` → «расхождений: 2», exit 1 |
| 11 | **C7** — якорь `open.tsv:150` `mail.fallback.transport` на 191, строка переехала на 192 (Согласованность) | противоречие, ворота красные | **ПРОВЕРЕНО**: `scripts/check-facts-open.sh` → «РАСХОЖДЕНИЙ: 1», exit 1 |
| 12 | **C3** — жирные заголовки `chat_RU.md:1301` / `chat_EN.md:1318` «в той же транзакции» не помечены, хотя конец абзаца (B75) говорит о доводке минутной задачей (Согласованность) | противоречие в спеке | **ПРОВЕРЕНО**: `sed -n 1301p docs/chat_RU.md` — заголовок прежний |
| 13 | **C6** — `dsa/SPEC_RU.md:440`, `SPEC_EN.md:460`: тревогу поднимает счётчик; `alerts.yml:210` читает датчик (Согласованность) | мелочь | **НЕ ПРОВЕРЕНО** мной |
| 14 | **C8** — решения кворумом B75, B76 без строк в `decisions.tsv` (Согласованность) | мелочь | **НЕ ПРОВЕРЕНО** мной |
| 15 | **C9** — «живая сессия» в `chat_RU.md:876` = `frozen_at` пуст, код теперь исключает и запертую долю (Согласованность) | мелочь | **НЕ ПРОВЕРЕНО** |
| 16 | **C4** — комментарий `pin_attempts.ts:101-108` «one write or they are a hole» не называет, почему дыры нет (страж по `locked_at`) | мелочь | **НЕ ПРОВЕРЕНО** |

Мелочи линз без опровержения (не перепроверялись, остаются в сырье): C5, C11, C12, C13, O5–O8, P2, P7, D5, D10 (триггер до `try`).

### Известно раньше (PARTLY — уже в реестре или на прошлых панелях)

- O1+O2+C10 — счётчик «отложено»: панель 4 К5/Н4, сделано как B74 (83e5983), в day58 не влито; при вливании поправить `watchdogs_RU.md:190` / `_EN.md:196`.
- P3 — 401 вместо 409 на последующих вызовах запертой сессии: так было и до B75 (страж отвечал 401 замороженной); остаток — `openapi.yaml` `Unauthorized` не называет замороженную сессию.
- P4 — общая пауза узла отвечает 429: старше диапазона, панель 4 (Н7).
- P6 — нет `WWW-Authenticate`: `PANEL_2026-09-21_steps1-2.md:173`.

### Опровергнуто (в доклад не идёт)

- S3 — иные SQLSTATE в точках заморозки/снятия: триггеров и отложенных ограничений нет, 54000 требует застрявшего собственного слушателя.
- S5+D1 — функция запроса точки после её конца: два места вызова, ни одно не уносит `inner`.
- D8 — ранняя остановка `closeIdentities`: закрытие уже отвязывает обращения (`identity.ts:1162`).
- Влияние D2, переход аренды в D4/O4 — см. таблицу.

### Невлитые ветки, которые панель зацепила

- **B72** (dc): `pg_notify` в перехвате отката заморозки — закрывает первую половину S1; вторая половина (`pendingFor`, `chats.ts:88` без проверки `locked_at`) — не видел в описании B72.
- **B74** (d5, 83e5983): счётчик и тревога отложенного снятия — закрывает O1; документы watchdogs не правит.
- **B81** (bf, 5f65204): `lock_timeout` 2 с на `/vault/share`, `/vault/pin`, `/sessions/invite` — закрывает маршрутную часть D4/O4; цикл заморозки минутной задачи не трогает.

## Нарезка на задачи

По одному пункту на задачу, отсортировано по тому, что раньше выстрелит.

| # | Задача | Уровень | Цена | Файлы |
|---|---|---|---|---|
| Н1 | S1, вторая половина: не отдавать реплики в комнату и не ставить их в очередь для сессии с запертой долей — `pendingFor` (`chat/relay.ts:50-65`) и выборка получателей `routes/chats.ts:87-89` с `NOT EXISTS (vault_shares … locked_at IS NOT NULL)`; тест: отложенная заморозка, открытая комната не получает новую реплику. Сверить с B72 (первая половина — notify) | дефект дизайна | ~1 ч | `chat/relay.ts`, `routes/chats.ts`, тест |
| Н2 | C1 + C7: карта тестов 658/705 с новыми строками B63–B79/B70 в обеих половинах; якорь `open.tsv:150` → 192 | противоречие, ворота красные | ~30 мин | `docs/test-map_RU/EN.md`, `docs/facts/open.tsv` (координатор) |
| Н3 | C3 + S1 (спека): заголовки `chat_RU.md:1301` / `chat_EN.md:1318` — «или, если строка занята, минутной задачей»; цену про сокет сформулировать «до записи заморозки», без «минуты» | противоречие в спеке | ~20 мин | `docs/chat_RU.md`, `docs/chat_EN.md` |
| Н4 | S2+D6: перепроверки под замком — `NOT EXISTS (… locked_at IS NOT NULL)` в `matches.ts:151`, `identity.ts:871`, `transfer.ts:427`; `support.ts` — считать `frozen` внутри транзакции после замка счётчиков | мелочь (гонка) | ~1 ч с тестом гонки | `routes/matches.ts`, `routes/identity.ts`, `routes/transfer.ts`, `routes/support.ts` |
| Н5 | D2 + D3: исправить комментарий `pin_limit_rollback.test.ts:265` (у согласия повтора нет); сделать тест 40P01 различающим повтор и отказ — утверждать один исход и сломать другой. Решить кворумом: 40P01 → повтор или `return false`, как 55P03 | противоречие + сила теста | ~40 мин | `test/pin_limit_rollback.test.ts`, возможно `lib/take_down.ts` |
| Н6 | D4/O4: `SET LOCAL lock_timeout = '2s'` в транзакции заморозки минутной задачи (`take_down.ts:84-88`) | мелочь | ~20 мин с тестом | `lib/take_down.ts` |
| Н7 | D9: `.catch → null` у транзакции `routes/profile.ts:105`, тест `expired_take_down.test.ts:225` ждёт 503 | мелочь | ~20 мин | `routes/profile.ts`, тест |
| Н8 | P5 + P3 (остаток): openapi `/sessions/claim` — `$ref RateLimited`, 400/404/409/503, схема 200; `Unauthorized` называет замороженную и запертую сессию | мелочь | ~30 мин | `docs/api/openapi.yaml` |
| Н9 | S4/P1: `prefix64` — IPv4-mapped/compatible в шестнадцатеричной записи не сводить (или привести к точечной), тест `::ffff:c000:280` ≠ `::ffff:c000:281`; спросить, что пишет Bunny в `x-client-ip` для IPv6 | мелочь, латентно | ~30 мин | `lib/rate_limit.ts`, `test/rate_limit.test.ts` |
| Н10 | Документы-мелочи одним заходом: C6 (`dsa/SPEC_RU/EN` — тревога читает датчик), C8 (строки B75, B76 в `decisions.tsv`), C9 (определение «живой сессии»), C4 (комментарий `pin_attempts.ts:101-108`), watchdogs при вливании B74 | мелочь | ~40 мин | документы, `decisions.tsv` (координатор) |
| Н11 | O3: задача на прочих ошибках одной строки — лог и следующая личность, а не весь проход; источник такой ошибки сейчас не найден | мелочь | ~20 мин | `lib/take_down.ts` |
