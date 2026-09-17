# Process: a description with not a single ground for complaint, 2026-09-14

Set up on the owner's word on 2026-09-14: "move gradually without asking all the time;
the result is a description with not a single point for a complaint; only after that
write code; at a crossroads ask interactively".

This is a working procedure, not a spec. It says **how** the documents are brought to
readiness before code is written and **when that ends**.

## What counts as the result

The description is ready when a **full review panel** (all five lenses: law, security,
data and DBMS, autonomy, consistency) plus refutation over all product documents yields
**zero confirmed findings above a minor one**, and the machine checks are green. Minor
findings from that run are closed in the same pass; deferred items with a named reason
(⚪) do not block the result if they are recorded in `docs/facts/open.tsv`.

Product documents in scope: `xor.ad/docs/chat_*`, `chat-flows_*`, `protocol_*`,
`offers/SPEC_*`, `dsa/*`, `refusal-wordings_*`, `test-map_*`, `depth-client_*`, `dpia_*`,
`docs/facts/*.tsv`; screens and mechanics of both storefronts `sosed.place/docs`,
`neighbro.place/docs`; the published legal texts `landing/legal/*` of both storefronts.

## The loop

Every round is the same and runs without questions:

1. **Pick a batch.** Since 2026-09-15 — by the stage of the route `ROADMAP_2026-09-15_to-drawing_EN.md`; within a stage — from what is open (panel records, plan v1, `open.tsv`) — a batch
   on one topic, ~30–60 minutes of editing. Order: 🔴 → what others depend on → 🟡 → ⚪.
2. **Edit.** Since 2026-09-15 — a batch through `scripts/batch-edit.py` (all or nothing, RU/EN pair, mirrored storefronts, brand in legal texts, retired wordings into `docs/retired-terms.txt`); each changed
   paragraph is reread whole afterwards. Superseded text — `[retired]` with a date. RU
   and EN as a pair, storefronts as mirrors.
3. **Machine checks.** `readdress-facts.py --write`, then one command `scripts/harden-cycle.sh` — every gate of the three
   repositories with one verdict and an exit code (since 2026-09-15; the manual list of checks and the control grep [retired]:
   they missed red twice). Red is fixed within the same round.
4. **Commit** to the day branch in every touched repository — only if `harden-cycle.sh` exited zero. **No push** — a push to a
   shared branch only on a separate word.
5. **A panel over the batch** — every two or three batches, or after any batch with new
   mechanics: three lenses for the subject (security mandatory) and a refuter; the record
   in `docs/reviews/PANEL_<date>_<subject>.md`, raw text verbatim by script.
6. **Panel findings** go into what is open and are picked by the next rounds.
7. **A short report** after every commit: what closed, what is open, what is next —
   with no question unless next is a crossroads.

## When the process stops and asks

Only at a crossroads — by a questionnaire with the price of each option:

- **a product decision**: a finding has two or more honest outcomes, and the choice
  changes what a person sees or what is stored about them;
- **a legal fork** where a lens's conclusion is not a lawyer's and the text goes into a
  published document;
- **reversing a decision** the owner recorded earlier;
- **going outside**: a push to a shared branch, publishing legal texts on the live
  storefronts, a letter to a lawyer, money.

Everything that follows from a decision already made, from code, from a measurement or
from a project rule is decided by the process itself and reported with its price.

## Order of work before the final panel

1. Storage 2.4 (SEC4, DATA1–5 of `PANEL_2026-09-14_stage2-part1.md`).
2. Tails of the script replacements from the same record.
3. Items 2.5–2.7 of plan v1: the "stepped away" label, support, promises without an
   executor, stickers, `depth`.
4. Stage 3 of plan v1: legal texts in one revision, DPIA, the art. 30 register, the DSA
   README — after checking the norms against the source (stage 0.1).
5. Stage 4, the document part: the receipt-without-email spec, the art. 18 log, the
   letter to a lawyer (sending it is a "going outside" crossroads).
6. Stage 1 watchers — **as a specification only**; the code waits for the end of the
   process.
7. **The final full panel.** Confirmed findings above minor become batches and the panel
   repeats. Zero — the process is closed and code begins.

## What the process does not do

- It writes no product code and does not touch `relay/`, CI or rollout.
- It does not push to shared branches or publish.
- It does not change the owner's recorded decisions without asking.

**S6 closed 2026-09-17:** the drawing brief — `docs/drawing-brief_EN.md`, the API build brief — `docs/api/build-brief_EN.md`; gate 3 of the route closed by the owner's decision (the convergence of five passes accepted as zero).
