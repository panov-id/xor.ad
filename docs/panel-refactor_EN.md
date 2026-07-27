# Panel refactor: checklist and decisions

Written 2026-07-27 after reading the screenshots (`testing/screenshots/`, produced
by `scripts/screenshot-panel-logs.sh`). The panel works, but it looks unfinished —
and on the log pages it shows nothing by default while the data is right there.

## What the screenshots showed

**Empty logs are behaviour, not taste.** The scope switcher defaults to
`platform`, which is the pre-tenancy root: after the migration it is empty by
definition, because every record lives under a tenant. Production holds 3 page
views and displays 0. The empty state then blames the time window ("Nothing in
this window") when the scope is at fault.

**Reuse is half-done.** `LogExplorer` carries four log pages — good. But
`waitlist` and `panel-users` are hand-written tables: their own `<table>`, their
own badges, their own empty states. That is where the red brand badge comes from —
it lives apart from the badges in the logs and says "error" in red about an
ordinary brand.

**Small things that add up to "unfriendly":**

- the sidebar shows a lone `platform` with no label, then ~250 px of nothing;
- the page name appears three times — menu, breadcrumbs, and shouted in the `h1`;
- content occupies the top third and the rest is empty: no content width, no rhythm;
- the histogram has no time axis — three bars and "peak 1 per bucket";
- native `select`/`input` sit beside styled buttons;
- on a phone the table runs past the edge with no scroll, and the text is cut.

## Decisions taken

| Question | Decision |
|---|---|
| Visual language | **Hybrid**: a calm base for tables and data, brutalism kept for accents (header, action buttons, logo) |
| Default scope | **All brands at once**, with a brand column |
| Dark theme | **Yes, with a toggle**, the choice remembered |
| Mobile | **Must work**: rows become cards, the menu collapses |

## Checklist

### A. Data and scope

- [ ] **A1. Merge collections.** `readLogPage` learns to read several scopes at
      once: listings are merged, each record is tagged with its brand, and window,
      cursor and histogram are computed over the merged set. The cursor is already
      time-based (`before` is an ISO stamp), so merging is honest; the counts
      become sums.
- [ ] **A2. A brand column** in the logs whenever the merged mode is on —
      otherwise the rows are indistinguishable.
- [ ] **A3. The scope switcher**: "All brands" first and by default, then brands by
      name, then `unattributed` and `platform (pre-migration)` — the last marked
      plainly as an archive.
- [ ] **A4. Honest empty states.** Separate "nothing in this window" from "nothing
      in this scope", and offer the move: widen the window, switch the scope.

### B. Reusable modules

The goal: a page should describe **what to show**, not **how to draw it**.

- [ ] **B1. `PageShell`** — title, breadcrumbs, an actions slot. The page name is
      declared once.
- [ ] **B2. `DataTable`** — columns with renderers, states (loading, error, empty),
      row expansion, mobile cards. One component for logs, waitlist and operators.
- [ ] **B3. `Toolbar`** — scope, range, facet, search and refresh in one shape.
- [ ] **B4. `Badge`** — one component with variants: brand, log level, role, state.
      Colours from the palette; a brand is no longer red.
- [ ] **B5. States** `EmptyState` / `ErrorState` / `LoadingState` — three files
      instead of a copy per page.
- [ ] **B6. Move `waitlist` and `panel-users`** onto `DataTable`; delete their own
      tables.

### C. Visual

- [ ] **C1. Tokens** — colour, type, spacing, radii and shadows as CSS variables;
      the dark theme as a second set of values; a toggle that remembers.
- [ ] **C2. Sidebar** — a labelled header ("Scope: platform"), the menu directly
      beneath it, a clear active item, `Logout` at the bottom.
- [ ] **C3. One title** — breadcrumbs or `h1`, and not in caps.
- [ ] **C4. Content grid** — a width, a vertical rhythm, a table that fills the
      viewport rather than a third of it.
- [ ] **C5. Histogram** — a labelled time axis, a hover readout, a legible scale.
- [ ] **C6. Controls** — one look for `select`/`input`/buttons, a visible focus
      ring, a range button whose active state is unmistakable.

### D. Mobile

- [ ] **D1. Breakpoint**: table rows become field-and-value cards.
- [ ] **D2. The menu** collapses into a button instead of owning the first screen.
- [ ] **D3. The toolbar** wraps; facets scroll horizontally.

### E. Accessibility

- [ ] **E1.** A visible focus ring everywhere interactive, contrast at 4.5:1 or
      better, `aria-live` on status text, `scope` on table headers.

### F. Verification

- [ ] **F1. Before/after screenshots** — desktop and mobile, light and dark, every
      page; the comparison ships with the result.
- [ ] **F2.** `typecheck-panel.sh` and the panel e2e suite green.
- [ ] **F3.** This document updated with what was actually done.

## Pass 1 — done (2026-07-27)

**A1–A4 and B1–B6 are closed.** Verified by screenshot: the page-views table
showed `0 rows` and now shows 21; client errors show 3 instead of 0.

- `readLogPage` reads **several scopes at once**: listings merge and every row
  gains a `scope` label (the reader's label for where it came from, not a field of
  the record — the node's own logs carry no brand at all). The merge is honest:
  ordering and the cursor were already time-based, so nothing had to be
  renumbered.
- The routes answer with an envelope carrying `scope: {mode, of, capped}` — the
  panel knows what it is showing, and admits when there are more brands than one
  page may merge (`MAX_MERGED_SCOPES = 10`).
- The pre-tenancy root became a scope **by name** (`?brand=platform`) rather than
  the default. That was the cause of the empty pages.
- Audit and server logs are marked `singleScope`: one collection each, so a
  switcher there would mean nothing.
- Shared modules: `DataTable`, `Badge` (plus `toneForLevel`, `toneForRole`),
  `EmptyState` / `ErrorState` / `LoadingState`. The waitlist and the operator list
  moved onto them; their own tables are gone.
- The red brand badge disappeared **on its own** — because the badge became
  shared, and in the shared vocabulary colour is spent on warnings and refusals. A
  brand is neutral.
- Empty states name the reason and offer the move: "nothing in this window" (with
  "widen to 7d"), "the archive is empty" (with "show all brands"), "a filter is
  hiding it" (with "clear filters").
- Tests: two new ones in `tenancy.test.ts` — the platform reads every tenant at
  once with each row naming its source, and the archive is reachable only by name.
  33 + 10 green, panel typecheck clean.

**Noticed along the way, for pass 2:** a histogram bar overflows the top of its
box on a tall peak; the "·" badge on an ordinary view is noise — an empty cell is
more honest.

## Order

Three passes, each self-contained and checkable by screenshot:

1. **A + B** — the panel starts showing data and stops duplicating code. The red
   badge disappears here, because the badge becomes shared.
2. **C** — tokens, dark theme, grid, histogram, controls.
3. **D + E** — mobile and accessibility.

The first pass is worth the most: it fixes what makes the panel look broken.
