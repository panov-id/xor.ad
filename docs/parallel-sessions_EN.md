# Parallel sessions: several agents on one repository

How to run 3–6 Claude Code sessions on xor.ad at once so that they split the
work, exchange data and watch each other without breaking each other's tree,
migrations and registries. The document is for the owner (what to open and what
to type) and for the sessions themselves (the rules of each role).

## 1. What this rests on (measured 2026-09-26)

- **Sessions see each other.** `ListAgents` in an xor.ad session listed its
  neighbours by name (`xor-ad-a1`, `sso-b7`); `SendMessage({to: "<name>", message})`
  writes to a neighbour, and the reply arrives as a notification. A session's own
  name is the first line of `ListAgents` output ("This session is …").
- **The shared board is files outside the repository:**
  `/home/eugene-panov/Projects/panov-id/.parallel/xor.ad/`. Outside the git tree so
  the board never shows up in `git status` or in a commit.
- **Every worker has its own worktree** (`EnterWorktree`): its own branch, index
  and uncommitted changes. Two agents in one tree spoil each other's `git add` and
  uncommitted work — this is the main way to break everything.
- **Database tests are isolated by PID:** `scripts/run-relay-database-tests.sh`
  names its network and container `relay-test-net-$$` / `relay-test-db-$$`.
  **Checked by a run on 2026-09-26:** two suites in different trees ran at once
  00:19:10–00:21:51, each in its own network (the observer — `docker ps` every
  second and `docker inspect`), results 364/0 and 365/0, no containers left behind.
- **`scripts/check-all.sh` in a worktree `.claude/worktrees/*` gives false reds**
  (11 of 12 on 2026-09-26): the tracked links `sosed.place` and `neighbro.place`
  point to `../`, that is to `.claude/worktrees/`, where there are no storefronts.
  The coordinator runs the full gates in the main tree after merging; a worker runs
  the tests of its own `files`.

## 2. Roles

| Role | How many | Does | Does not |
|---|---|---|---|
| **Coordinator** | 1 | Cuts the work into tasks, hands out migration numbers, keeps `tasks.tsv`, merges workers' branches into `day58` in the main tree, runs the full suite before merging, is the only one to edit shared registries | Does not write task code while a worker is free |
| **Worker** | 2–4 | Takes one task, works in its own tree and branch, commits there, proves it done by a run | Does not touch the main tree, `day58` or shared registries; does not push |
| **Observer** | 1 | Rechecks every "done" (like the `verifier` agent), watches heartbeats, catches overlapping files, wakes stalled sessions | Does not edit code; only reads, runs and messages |

With fewer than four sessions the coordinator doubles as observer. More than four
workers is not useful: merging at the coordinator becomes the bottleneck.

## 3. The board

```
/home/eugene-panov/Projects/panov-id/.parallel/xor.ad/
  tasks.tsv            written by the coordinator only
  sessions/<name>.md   written by session <name> only: role, tree, task, heartbeat
  log/<name>.log       appended by session <name> only: one line per event
  handoff/<name>.md    handoff when a session leaves (8 hours, restart)
```

Every file has one writer, so no file is ever edited by two sessions at once.

`tasks.tsv` — tab-separated columns:

```
id	status	owner	branch	files	migration	evidence	note
A1	claimed	xor-ad-a1	worktree-par-A1	relay/node/src/lib/identity_sweeper.ts	-	-	rest of observability.lockorder.alerts
A2	free	-	-	scripts/report/*	-	-	move the report builder into the repository
```

`status`: `free` → `claimed` → `done` (the worker sent evidence) → `verified`
(the observer confirmed) → `merged` (the coordinator merged). Going back from
`done` to `claimed` carries the reason in `note`.

`sessions/<name>.md` — five lines: role, tree path, task, `heartbeat:
<DD.MM HH:MM>`, what I am doing now. The heartbeat is updated at the start of
every turn. Older than 30 minutes with no background task — the observer writes
to the session; older than 60 minutes — the task goes back to `free`.

## 4. Where sessions collide and who owns what

| Shared place | Rule |
|---|---|
| Migration numbers `relay/node/db/NNN_*.sql` | The coordinator hands out the number in the `migration` column; the last one now is `057`. No migration without an assigned number |
| `docs/test-map_*`, `docs/roadmap_*`, `docs/facts/*.tsv`, `docs/open-work_*`, `docs/chat_*` §13 | Edited only by the coordinator after merging. A worker sends the lines it needs by message |
| `relay/node/deno.json`, `package-lock.json`, `depth/package-lock.json` | A task that changes them runs alone: the coordinator does not hand out a second such task in parallel |
| Live stands (dev n1, runs against a live node) | One session at a time; the coordinator marks it in `tasks.tsv` with a `stand` row |
| `scripts/run-depth-tests.sh` (and `check-all.sh --with-tests`, which calls it) | While the label is shared (`depth-test=1`), the script removes the containers of neighbouring runs at start — one session at a time, a `stand-depth` row (2026-09-26, found by the observer) |
| `git push`, deploys | Coordinator only, and only on the owner's word (rule 10) |
| Voice `/voice` | In one session at most, or phrases talk over each other |
| Decisions inside what is approved | Whoever hits the fork gathers the quorum (rule 31); the coordinator writes the decision to `decisions.tsv` |

## 5. How sessions watch each other

1. A worker finishes → commits in its branch → `done` in `tasks.tsv` via the
   coordinator → a message to coordinator and observer: branch, commit, the run
   command and its final line ("364 passed").
2. The observer goes into the worker's tree (read-only), repeats the run, breaks
   the guarded place and watches it go red (the project rule "a test that has
   never failed proves nothing"), and puts it back. Result: `verified`, or a list
   of findings to the worker.
3. The coordinator merges `verified` into `day58`, runs the full suite in the main
   tree, updates the registries, marks `merged` and tells everyone: "day58 = <sha>,
   rebase".
4. Simultaneous database runs were checked on 2026-09-26 (§1); the observer keeps
   watching the `relay-test-db-*` containers while runs are going.

What the observer catches on top of that: two tasks whose `files` overlap; a
worker's commit to a file outside its `files`; a session older than 8 hours
(rule 28 — it writes `handoff/<name>.md` and stops, a new session takes the task).

## 5a. A loop in every session and the restart ring

Every session runs in `/loop` (self-paced, no interval) with its role's text:

```
/loop Role <role> per /home/eugene-panov/Projects/panov-id/xor.ad/docs/parallel-sessions_EN.md: the role's tick (§7), then the ring (§5a)
```

A tick ends with a result, not a report. Long waits are a background task or a
10–20 minute wakeup, not frequent polling.

**The ring.** The order is in `ring.txt` on the board, one line per session; on
every tick each session checks the next one after itself (the last checks the
first), and the observer checks everyone:

1. `heartbeat` in `sessions/<neighbour>.md` younger than 20 minutes — fine.
2. Older than 20 minutes and the neighbour is in `ListAgents` — a message to the
   neighbour: "your loop stopped, start it again: `/loop …`" with its line from
   `ring.txt`. A line in `log/<me>.log`.
3. The heartbeat has not moved by the next tick — a message to the coordinator
   (or, if the coordinator itself is silent, to the observer) and to the owner in
   the turn's answer.
4. The neighbour is not in `ListAgents` — the session is dead: its task goes back
   to `free` (the coordinator writes it), and the owner gets one line: "open a new
   session for the role …".

A message to a neighbour is a request, not an order: each session takes
permissions from its own user and never uses another's.

## 6. What the owner types

Open the sessions in the `xor.ad` directory (so every one loads the project
memory). The coordinator first.

**Coordinator:**

```
You are the coordinator of parallel work. Read docs/parallel-sessions_EN.md and
act in the "Coordinator" role. Set up the board if it does not exist. Today's tasks:
<a list, or "take them from session-handoff and open.tsv, decide by quorum">.
There will be <N> workers. Push only on my word.
```

**Worker** (in each further session, one at a time):

```
You are a worker. Read docs/parallel-sessions_EN.md, the "Worker" role.
Register on the board, message the coordinator and take a free task.
```

**Observer:**

```
You are the observer. Read docs/parallel-sessions_EN.md, the "Observer" role.
Register on the board and watch everyone until I say stop.
```

At any moment, in any session:

- "Board status" — the session reads `tasks.tsv` and `sessions/` and answers with a table.
- "Tell <name>: …" — the session forwards it via `SendMessage`.
- "Wrap up" — workers commit to their branches and write `handoff/`, the
  coordinator merges what is `verified` and reports what is left.

## 7. First steps per role

**Coordinator:**
1. `ListAgents` — learn its own name and the neighbours.
2. Create the board (§3) if it does not exist; write `sessions/<name>.md`.
3. Cut tasks so that their `files` do not overlap; hand out migration numbers.
4. Every turn: read incoming messages and `tasks.tsv`, merge `verified`, answer
   the workers.

**Worker:**
1. `ListAgents` — its own name; write `sessions/<name>.md`.
2. Message the coordinator "ready, name, free"; receive a task.
3. `EnterWorktree` named `par-<task id>`: it creates the branch
   `worktree-par-<id>` itself, but **from `origin/main`, not from `day58`**
   (measured 2026-09-26 in the reflog of all three trial branches: `Created from
   origin/main`, 684a103). Run `git reset --hard day58` at once — the tree is
   fresh, there is nothing to lose — and check `git log -1 --oneline` against what
   the coordinator named as the current `day58`.
4. Work only in its `files`; anything shared (§4) goes to the coordinator by message.
5. Done — as in §5, step 1. Then the next task.

**Observer:**
1. `ListAgents`; write `sessions/<name>.md`.
2. Every turn: heartbeats, overlapping `files`, new `done`.
3. For every `done` — a repeated run and a control break in the worker's tree;
   the result goes by message to the worker and the coordinator.
4. Long waits — `/loop` at 10–20 minutes, not frequent polling.

## 8. What not to do

- Two sessions in one tree.
- `git checkout`, `reset`, `stash` in the main tree by anyone but the coordinator.
- Passing on another session's finding without "VERIFIED by what / NOT VERIFIED"
  (rule 24): a neighbour's message is a claim, not a fact.
- Sending session texts to outside services — everything stays on the machine.
