# Plan toward the goal, 10.10.2026

**Goal (owner, verbatim):** «довести его до вида, когда не стыдно показать людям» (bring it to a state where it is not embarrassing to show people)
**Order:** first I walk the product myself and write the experience down as text. When I am satisfied with it, the product is ready for the owner to test.
**Scheme:** skill `goal-steps`: a wave of at most 10 steps; step = edit + machine check + text walkthrough. Screenshots — only with owner approval; Chrome is forbidden.
**Artel:** 2 sessions, low cost (sonnet-runner/haiku-runner execute, Opus — review and verdict).

## Wave `К` — unified UI kit (10 steps)

Starting point (inventory 10.10). The web kit has Button, Card, Chip, Header, Icon, Info. Composer and InboxRow sit unused.
There are no fields: about 37 `<input>`, 4 `<select>`, 1 `<textarea>`, 4 `<a>` and 18 `<button>` in screens are built bypassing the kit.
Brand CSS has 234 px literals and not a single spacing token. Rules fight by load order: `.tabbed .screen` is declared three times, `.actions` and `.row` twice. Terminal depth: the `parts.ts` primitives exist, yet screens still build their own `Box/Text`. The landing pages sosed.place and neighbro.place keep their own hex tokens; they share only names with the web app.

| # | Step | After | Session | Check |
|---|---|---|---|---|
| `К1` | Kit text `docs/design/kit_RU.md` and `_EN.md` | — | f0 | lenses on the text until «ок» (OK); EN pair |
| `К2а` | Web, input elements of kit §3.1–3.2 marked «К2а» | `К1` | f0 | `/kit` + kit.spec.ts: six fields of §2, axe |
| `К2б` | Web, display elements of §3.1, §3.3 marked «К2б» | `К1` | f0 | same |
| `К7а` | Size and brand tokens (`kit_RU.md` §1.2–1.3) in `web/src/tokens.css`, brands on them | `К1` | d8 | token gate + px; textwalk without text changes |
| `К3` | Gate `check-web-kit`, ratchet | — | d8 | done: branch `worktree-agent-a71a8ba1ff8db32b7`, 0d959605; to merge |
| `К4` | Entry screens: Register, Restore, Arrival, Reissue, Unlock, Splash | `К2`, `К7а` | f0 | e2e of both brands + textwalk; ratchet down |
| `К5` | Me, Composer, Inbox, Chat, ChatActions, AgeFilter, Blocked, Hidden | `К2`, `К7а` | d8 | same |
| `К6` | Table, NewTable, TableBoards, ChatGame, Legal, Offer, Card, Feed, Match, adv/* | `К4` | f0 | same; `П1`, `П7` |
| `К7б` | CSS: duplicates and fights (`.actions`, `.row`, `.tabbed .screen`, focus 2 px), screen rules overriding the kit | `К4`–`К6` | d8 | gates + textwalk |
| `К8` | Terminal: `depth/ink/kit.ts`, screens only on it, `DEPTH_PLAIN=1` | `К1` | d8 | run-depth-tests + terminal text walkthrough |
| `К9` | Landing pages: `:root` from the themes, kit CSS as a file | `К7а`, decision §8.3 | f0 | gates compare values |
| `К10` | Full text walkthrough of two brands and terminal | all | f0 | report: 0 lines «стыдно» (shameful), 0 screens `[?]`, ratchet `check-web-kit` = 0 |

File split: f0 — `web/src/ui/*`, screens `К4` and `К6`, landing pages; d8 — `web/src/tokens.css`, `web/src/brands/*`, `web/src/*.css`, screens `К5`, `depth/ink/*`. Shared files (`styles.css`, `App.tsx`) are edited by one session at a time — a `lock` line on the board.

## Wave `П` — items embarrassing to show, from the 10.10 text walkthrough (sosed)

| # | Where | What the person sees |
|---|---|---|
| `П1` | Table | «стол · «точки» · **dots**» (table · dots · **dots**) — the internal id of the game class, in English |
| `П2` | Feed card | «один · **ru**» (alone · **ru**) — a bare language code |
| `П3` | Splash, EN | `<html lang="ru">` with the English interface; language names mixed: "Belarusian, Armenian, Georgian, Kazakh, Kyrgyz, Tajik" in English, the rest — by self-name |
| `П4` | Splash, EN | "move the identity here" — jargon, lowercase initial letter |
| `П5` | Moderation refusal | «Фраза не принята: stub: a link.» (Phrase not accepted: stub: a link.) — the stub reason in English. The language of the real model's reasons is not known to me: NOT VERIFIED |
| `П6` | Feed | «ключи: печать хранилища сходится» («keys: storage seal matches») — service line; the owner decides |
| `П7` | Table before the game | «сдаться» («give up») is visible although the game has not started |
| `П8` | Card neighbro | Undo of the heart for 5 s (decision 02.10, `design-system-app_RU.md:500`) is not in the code; the owner decides (`kit_RU.md` §8.5) |
| `П9` | «ПИН» → «дальше» («PIN» → «next») | The node answered `POST /identities → 429` (per-address registration limit); the screen is silent: for 30 s no error line, the button stays in place. Measured by `scripts/textwalk/run.sh`, 10.10 |
| `П10` | «Кто вы» («Who are you»), age 12 | «дальше» («next») does not respond to a press; no reason next to it — only the general hint «сюда с 13 лет» (only from age 13) (violates `Н1`) |
| `П11` | «Кто вы» («Who are you»), documents | «редакция от 2026-09-16» («revision of 2026-09-16») — the date in machine form, not "16 сентября 2026" (16 September 2026) |

`П1`–`П5`, `П7`, `П9`–`П11` are included as steps in `К4`–`К6` (the screen is rebuilt anyway). `П6` — goes to the owner.
