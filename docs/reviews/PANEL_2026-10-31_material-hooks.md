# Panel 2026-10-31: rule 40 material hooks (repository .claude)

Subject: hooks/materials.py, hooks/material-intake.py, hooks/use-ready-artifacts.py, scripts/bin/material-inventory,
hooks/plan-before-go.py, their *.cases.py, settings.json registration.
Lenses: security (fable), correctness (opus). Lens coverage: 9 of 32 files. Not read by a lens: ~/.claude/CLAUDE.md
(rule 40), skills/goal-steps/SKILL.md, the 20 changed files of xor.ad (screens 23–29 hand work, to be redone by
extraction), docs/GOALS_RU.md, docs/GOALS_EN.md, the blog post (repository www.panov.id).

## Fixed, each with a case broken red and restored

| # | Lens | Finding | Level | Fix | Case |
|---|---|---|---|---|---|
| 1 | correctness | use-ready-artifacts.py:32 markup regex refused object literals and TS types in .tsx | critical, reproduced live on app/src/screens/Feed.tsx | style-sheet rule regex only for css/scss/sass/less; components gated by className/class/style only | object literal, TS type |
| 2 | correctness | markers counted in context copied from old_string | important | `added()` subtracts markers already in old_string | text next to existing className passes; a second className refused |
| 3 | correctness | "Ready unfit" with any owner word lifted the gate for all | minor | the line must name a file of the holding material | unfit naming a foreign file refused |
| 4 | correctness | deleted material kept gating | important | ready_families skips paths gone from disk | deleted material passes |
| 5 | security | corrupt/encrypted archive crashed the inventory, project locked for good | important, reproduced | per-archive try/except, registered as "(unreadable: …)"; tree written with errors=replace | corrupt zip: rc 0, edit passes |
| 6 | security | nested zip read whole into memory | important | nested zip over 200 MB listed by name, not opened | not exercised (no 200 MB fixture) |
| 7 | security | prompt paths probed anywhere (~/.ssh, /etc) and offered for inventory | important, reproduced | only archives or paths inside a git work tree | folder outside a project: nothing |
| 8 | own | prompt hook fired on subagent hand-backs and on a bare "/" | minor | skip agent-message/hand-back/task-notification; ignore paths of under 3 parts | two cases |
| 9 | security | free() by substring "/memory/", "/scratchpad/" | minor | prefixes: ~/.claude/ and /tmp/claude-*/…/scratchpad/ | no case |
| 10 | security | plan marks of 1–3 chars or without word boundary | minor | length > 3 and a boundary | existing plan cases green |

## Open, not fixed

- materials.py:97-129 latency: 0.5–2.2 s per Edit on xor.ad (both lenses measured); fail-open on timeout. Minor.
- plan-before-go.py:39-62 a step that only mentions a .tsx (tests only) is flagged. Minor.
- use-ready-artifacts.py:48-56 adding "generated from" by hand to a file's head passes. Minor, self-bypass.
- materials.py:70-80 folder stamp misses remove-one-add-older. Minor.
- materials.py:65 registry of a wrong shape raises (fail-open). Minor.
- Disputed, kept: "html alone makes css ready" (correctness 3). The kit's html files carry ~387 k characters of CSS
  inside them; that is the very case of 30.10, so html seeds the style sheet family on purpose.

Checks: material-intake.cases 20/20, use-ready-artifacts.cases 21/21, plan-before-go.cases 0 failed;
hooks-cases.sh files failed 0; 7 fixes broken one at a time, each red; live on xor.ad: Feed.tsx object literal
passes, nd4.css hand rule refused.

## Second agent, refuting the fixes (sonnet)

Holds: deleted material (3), corrupt archive and nested cap by header size (4), TS literals (1).
Broken and fixed, each with a case broken red and restored:
- css: a changed value in a one-line rule was refused; a property added inside a rule passed. Now markers are
  selectors opened and properties declared, after comments are stripped.
- MultiEdit context was not subtracted. Now old text of all edits is.
- "Ready unfit": substring match on names, and the placeholder `<his words>` was accepted. Now a bounded name and
  no placeholder.
- One bad inner zip hid its siblings. Now the inner open has its own try.
- Any source folder named in a prompt raised the nag. Now only a folder that is itself a material.
Open: the header file_size of a crafted zip can lie (not tested); `[Subagent hand-back]` marker matched by the
text this session receives, not checked against the harness source.

Recount after this pass: use-ready-artifacts.cases 27, material-intake.cases 23, hooks-cases.sh files failed 0.
