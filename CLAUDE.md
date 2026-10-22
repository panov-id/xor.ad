# Project Rules

- **Exercise what you build or claim. Reading the code is not a check.** Nothing
  is reported as working, done, or already-the-case unless it was run against the
  thing itself: the live URL, the deployed node, the registry, the database, the
  actual screen. A route read in a file, a checklist tick, an old note — each is a
  claim, and claims get measured before they are repeated. This rule exists
  because the opposite kept happening: prod was said to have no rate limit while
  it had one, a DNS cutover was listed as pending after it had happened, a panel
  URL was handed over with a `#` nobody had tried, and a screen shipped that no
  role could open.
- **A test that has never failed proves nothing.** After writing one, break the
  thing it guards and watch it go red with a legible message, then restore. A
  green suite whose failure mode was never seen is decoration.
- **Say what was verified and how, and say plainly what was not.** "Checked in the
  registry: both digests match" and "not exercised live" are both useful. "Should
  work" is not.

- Whenever working on any README in this project group (`xor.ad/README.md` / `README_RU.md`, `sosed.place/README.md` / `README_RU.md`, `neighbro.place/README.md` / `README_RU.md`), synchronize across all of them before finishing: keep the EN/RU pair of each file consistent with each other, and keep cross-references and shared facts (architecture, features, links between the three faces) consistent across all three repos.

<!-- global:begin sha=ad3e7094e7 -->
## Saving tokens (global block, edited in ~/.claude/templates/project-rules.md)

- Noisy output only through `digest`: `… 2>&1 | digest <phpunit|phpstan|cs|compose|git|httplog|auto>`.
  It prints at most 12 lines, puts the full text in the scratchpad and names the path; details with `sed -n` over a range.
  The hook `guard-long-output.py` refuses a test run, logs or a full diff without `digest`, `tail` or a file.
- A mechanical step with a machine check goes to `haiku-runner`; a module by a spec to `sonnet-runner`;
  a ready diff plan to `codex exec` through the wrapper (skill `delegate`). Fable: security, migrations, a fork with no answer; decisions and review: Opus.
- A run longer than a minute: `run_in_background`, read the result through `digest`, not the whole file.
- A command longer than 300 characters or with 4+ pipes and no script: `guard-inline-command.py` saves it to
  `~/.claude/state/inline/` and lets it run; a repeatable one goes to `scripts/` or `~/.claude/scripts/bin/`, a one-off to a file in the scratchpad.
- The project's offline gates are `.claude/gates.txt` (one command per line, `watch:` says which edits
  start them); after a turn with an edit `gates-run.py` runs them in the background, the verdict (rc per gate)
  arrives with the next prompt. Offline containers only: there is no network in the background.
<!-- global:end -->
