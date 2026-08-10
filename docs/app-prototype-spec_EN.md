# Spec: app prototype — Feed & Chat screens

Status: a record of what is **already implemented** in the interactive prototype. Further screens are next.

Artifact (live prototype): https://claude.ai/code/artifact/02d90a97-3b35-4667-a828-71aefd9f336f
Source: `neighbro.place/prototype/neighbro-app-proto.html` (single-file, no external assets — works under PWA/CSP).

## 0. Splash & onboarding (first run)

- **Splash loader:** the accent ground is overtaken by a circle of the main color growing from the center; center holds the house logo, `NEIGHBRO`, and the brand credit **`by PSYTICAN`** (accent). ~1.7s, then wipes out. Respects `prefers-reduced-motion`.
- **Onboarding / age gate (the very first thing on sign-up):**
  - Enter **age as a number** (not date of birth). `<13` blocks with an error; entry is disabled. (No age band shown.)
  - Optional name.
  - **Consent to the documents:** a checkbox "I agree to the Terms & Conditions and Privacy Policy" with links opening a modal with condensed text (full text at `neighbro.place/legal/*`). Operator in the documents is **PSYTICAN & PEJEDED (Evgenii Panov)**.
  - **Enter Neighbro** enabled only with a valid age (13–119) and consent checked. Completion stored in `localStorage` (`nb-onboarded`).
- Legal documents: `neighbro.place/landing/legal/terms_EN.md` and `privacy_EN.md` — both written and served by the documents page. English only, by decision (`open-work_EN.md` G7). `neighbro.place/legal/` holds pointers to them, not texts.

## 1. Aesthetic & tokens

Brutalism + concrete. Dark base + accent, hard borders, hard un-blurred drop shadows, mono labels as technical captions, subtle SVG grain (inline data-URI) over surfaces.

Fonts (system, no external CDN):
- display `--disp`: `"Arial Black", "Helvetica Neue", system-ui`;
- body `--body`: `system-ui, -apple-system, "Segoe UI"`;
- mono `--mono`: `ui-monospace, "SF Mono", Menlo, Consolas`.

Color tokens (recolor everything at once):
`--ink` (ground), `--ink-2` (panels/cards), `--concrete`, `--concrete-2` (hover/scrollbar), `--line` (borders/dividers), `--paper` (text), `--muted` / `--muted-2` (secondary text), `--gold` (accent), `--gold-ink` (text on the accent fill).

## 2. Two independent styling axes

### 2.1 Light/dark mode — in the profile popup
- **Dark / Light** switch in the profile popup (`Appearance` section). Removed from the header.
- Toggles **neutrals only**: `--ink`, `--ink-2`, `--concrete`, `--concrete-2`, `--line`, `--paper`, `--muted`, `--muted-2`. Accent untouched. Applies instantly.
- Dark is default (values in `:root`). Light is `[data-mode="light"]`: light concrete-paper ground, dark text, hard dark borders, black drop shadows (full light brutalism, not an inversion).
- Persisted in `localStorage` (`nb-mode`).

### 2.2 Accent — click the logo
- Clicking the header logo (`#themeBtn`) **silently** cycles the accent. No names, labels, or flashes — just a recolor.
- Changes only `--gold` + `--gold-ink`.
- 11 accents: `''`(gold, default) → crimson → teal → lime → magenta → azure → orange → violet → saffron → steel → grass.
- Persisted in `localStorage` (`nb-accent`), independent of mode. Any mode combines with any accent.

## 3. Header (topbar)
- Left: logo button (house+chat mark, `currentColor` = accent) + `NEIGHBRO`.
- Right: **Set location** button (`#locBtn`, pin + label), `34 nearby` indicator (pulsing dot), mode button.
- **Location**: the static "Kolonaki · 600 m" is gone. Distance is **never computed**. Matching is by chosen area, not meters.
- **Profile popup (name + age + language + docs):** a name chip on the right of the header (icon + name, `nb-name`, default `You`). Clicking the chip **or** the `Me` button opens a popup with a **blurred backdrop** (frosted glass, `backdrop-filter: blur`). Fields:
  - **Name** (≤24 chars), **Age** (`nb-age`, 13+ validation; `Save` disabled when <13/invalid) — both taken from onboarding and editable here;
  - **Language** — a 6-language switcher (EN/RU/FR/DE/ES/EL, `nb-lang`; the selector works, full app-string translation is a separate i18n task);
  - **Appearance** — a Dark / Light switch (see §2.1);
  - **Age filter** (to the right of the age field): who you see by age. **<21** — window fixed to `±2 years` (locked, sliders hidden). **21+** — two sliders: lower `21…your age`, upper `your age…+100` (up to ±100, but **never younger than 21**). Stored in `nb-fmin`/`nb-fmax`, label "See ages X – Y".
  - **Agreed at sign-up** — links to **Terms & Conditions** and **Privacy Policy** that open the document modal from within the popup.
  - `Save` / `Cancel`, close on Esc / backdrop click / Enter; the card scrolls on small screens.
- Responsive: at `max-width: 560px` the location label and the `nearby` text hide (icons remain).

## 4. Feed screen
- Panel head: `City feed` / `Newest · fades in 4h 20m` (ephemerality).
- Messages — a "scattered" collage feed (**width-based** CSS columns, `column-width: 330px`): a new column appears only when there is room for a full card, so cards **never squish** below ~330px. Slight tilt/offset on some cards (`nth-child`), hard drop shadow.
- Message card (`.msg`):
  - text;
  - meta: **people count** (people icon + `1 of us / 2 of us / 3 of us`, in accent) + `Nh Nm left` (fade timer);
  - **plus** button on the right; tap toggles `on` (accent fill) — "I'm in".
- Tap the message text → fullscreen viewer.

## 5. Fullscreen message viewer — plus/minus
- Full-screen overlay. Large display text, eyebrow `From a neighbor · Nh Nm left`, meta: **people count**, status `✓ you're in` when plussed.
- **Swipe mechanic = reaction:**
  - **swipe right = plus** ("I'm in") — the card is marked, stays in the feed;
  - **swipe left = minus** ("Skip") — the message is **removed from the feed and never shown again** (`removed`).
  - Mirrored by: `− Skip` / `+ I'm in` buttons, arrows `←`(minus) / `→`(plus). Close: `✕` / `Esc`.
- After an action — advance to the next non-skipped message (wrapping); if none remain — the viewer closes.
- Counter: `N left nearby` (how many not yet skipped). No distance.

## 6. Chats screen — list
- Tabs: `Chats N` / `Requests N` (brutalist blocks, active = accent fill).
- Thread (`.thread`): letter avatar, name, last-activity time, **last-message preview** (own line), **timer** `chat open · Nh Nm` (accent, own line), `›` chevron as a tap affordance.
- `Requests` — "likes you back →" (mutual likes, chat not open yet).
- Click a thread → opens the conversation.

## 6.1 Wide screen — 3-column workspace (`≥900px`)
- Three columns: **[Feed] | [Open chats] | [Active chat]**.
  - Feed is flexible (`flex:1`), chats `300px`, active chat `400px`.
- **Live feed + refresh:** the feed head has **`Refresh`** (pull new to the top manually) and **`Auto: on/off`** (auto-refresh, ~6s interval). A new message arrives at the top highlighted (`fresh`); the oldest fades out and leaves (`fading`).
- **Collapsible columns:** each column has a chevron button. A collapsed column **docks to the right edge** as a vertical rail tab (`City feed` / `Open chats` / `Active chat`); clicking the rail expands it. When the flexible feed is collapsed, the active chat grows to fill the space (`:has()`).
- Collapse/rails are wide-only.

## 7. Conversation
- **Active chat** — right column (wide) / full-screen overlay (mobile).
  - **Wide (`≥900px`)**: before opening — empty state `Pick a chat`; clicking a thread fills the column (`body.convo-open`), back button returns to the empty state.
  - **Mobile (`≤899px`)**: conversation full-screen (`position:fixed`); back → list.
- Conversation head: back button, name + timer `chat open · Nh Nm` (accent), 🎲 **propose-a-game** button.
- **Liked phrases (match context):** at the top of the conversation, a `Liked, in order` block — a numbered list of the phrases that were liked, **in like order**, labeled `You liked` / `They liked` with the quote. Shows why you matched.
- Bubbles:
  - `them` — left, surface `--ink-2`, drop shadow;
  - `me` — right, accent fill `--gold` + `--gold-ink`;
  - `sys` — centered, mono ("you both liked this — chat is open");
  - each bubble carries a time (`HH:MM`).
- Composer (`.composer`): text input `Write a message…` (`maxlength=256`) + send button (arrow, accent fill). Submit appends a `me` bubble with the current time and scrolls to bottom.
- **Propose a game** (🎲): dominoes / checkers / chess with **no built-in rules** — players drag pieces and agree the rules themselves; the other person gets a request to accept. (Details in `backlog_EN.md`.)

## 8. Bottom navigation (mobile, `≤899px`)
- 4 buttons: `Feed` / `Chats` / **`Say`** (accent, center — new message) / `Me`.
- `Feed`/`Chats` switch the view and close any open conversation; `Say` opens the post composer (placeholder for now: up to 128 chars, how many of you, location blur radius).
- Hidden on wide screens (feed+chats split is visible directly).

## 9. Breakpoints (summary)
- `≤560px`: compact header (icons without labels).
- `≤899px`: single-column layout, bottom nav, full-screen conversation.
- `≥900px`: 3-column workspace (feed / chats / active chat) with collapse-to-rail.
- Feed: column count is driven by `column-width: 330px` (width-based), not breakpoints.

## 10. Accessibility / quality
- `:focus-visible` — accent outline; `prefers-reduced-motion` — disables the pulse.
- Verified: horizontal `overflow = 0` in all states (wide/mobile, feed/viewer/list/conversation), iPhone 12 mini (375px) as the base screen.

## Out of scope (next screens)
Onboarding (birth year + name), Say screen (post), match moment, Me/profile, game screen (board), session freeze. See `app-ui-notes_EN.md`, `backlog_EN.md`.
