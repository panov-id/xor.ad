# Accessibility and the application's languages

Two subjects in one document, because they meet in one place: **the length of
text**. A German string is about a third longer than a Russian one, Georgian is
written in another script, and the terminal lives in 80 columns — and all of it
lands on the same layout that is about to be drawn.

Written on 2026-08-28, before the drawing stage. There was no document for either
subject: accessibility lived as three open questions in the terminal client, and
languages as a line in the roadmap.

## Part one: what is already decided and measured

This is not a blank draft — some of it is settled and verified, and does not need
repeating.

| What | Where it was settled | State |
|---|---|---|
| Contrast — **three steps**, not a slider | screen 10, 2026-08-26 | a continuous control inevitably offers positions below the threshold |
| A 4.5:1 contrast threshold, computed arithmetically | the panel and the landings | `landing/check-contrast.mjs`, gates the deploy |
| Theme: light, dark, as in the system | screen 10 | applied at once, reverted with one tap |
| `prefers-reduced-motion` disables animation | the landings | done |
| `:focus-visible` on everything interactive | the landings | done |
| Feed languages — **up to three**, from the browser by default | §8 of the mechanics, 2026-08-26 | plus the line "N more in other languages" |
| The terminal asks for its language at first run | `depth-client`, 2026-08-28 | not the locale, not a flag |
| The storefronts speak 17 and 10 languages | measured from the live sitemaps, 2026-08-28 | the landing's interface is translated |

**Not one application string is translated** — there is no application yet. What
is translated is the landing and the legal texts.

## Part two: accessibility

### The minimum that cannot wait

These four cost little at the drawing stage and a great deal after it, which is
why they are recorded here rather than on a wishlist:

1. **Colour is never the only carrier of state.** A fading conversation, a
   rejected name and a hidden phrase need a word or a mark, not just a shade. The
   same rule already holds in the panel.
2. **Tab order equals reading order.** The feed is a collage, and that is exactly
   the case where visual order drifts away from the order in the markup.
3. **A touch target is no smaller than 44 px.** **One exception, recorded
   2026-08-29: the cells of a game board.** The rule is about controls, where a
   miss takes you somewhere else; a cell is a surface a person magnifies
   themselves, and a miss costs one move back (screen 18 on the storefronts).
   The like and the "…" menu sit next
   to each other on a card; a miss between them is a like where a person meant to
   report.
4. **Every field is labelled by a word, not by a hint inside it.** A placeholder
   disappears on typing, and someone returning to the form loses the question.

### A sticker is a line, not a picture (added 2026-08-29)

The rule is short: **anything that occupies the place of a line must carry a
word.** A sticker is sent instead of text, which makes it the line itself;
without a name a screen reader reads emptiness where it stands, and a person in
a terminal sees a hole in the conversation.

So every sticker in the catalogue carries a short name, and it is the **same
one** for the reader and for the terminal: not an "alt text for the web" and a
separate "caption for the console", but one string serving both. Two strings
would drift, as everything written twice does.

The names are translated into the storefront languages the same way the
community guidelines were: machine translation under the clause now, a native
speaker improving it later. An untranslated name is an English island in
someone else's conversation, not an absence of accessibility — so no case here
ends in emptiness.

## The board: keyboard and words (added 2026-08-29)

A game board is the hardest surface in the product: until 2026-08-29 the only way
to move was dragging, which meant no play from a keyboard and nothing at all for
a screen reader.

**The solution did not need inventing — it was already written in the terminal
client.** `depth` draws the same board and moves across it with keys: select,
move, leave. The web takes the same grammar, and the four operations on a piece —
take, put, rotate, flip — turn out to be a ready vocabulary for the mouse, the
keys and the reader alike.

**A move is announced in the same words that name it.** "Anya put a piece on e4",
not "Anya made a move": the second forces a walk across the whole board after
every twitch. The vocabulary of coordinates belongs to each class of board; a
free table has no coordinates and announces adjacency instead ("placed it against
the six"); the "physics" class has no coordinate at all, and there it honestly
stays "flicked" — the one place in the product where a game remains sighted, and
that is recorded rather than passed over.

## The terminal: what we do not know

The three open questions of `depth-client` stay open honestly, and here is what is
known about them:

- **A screen reader in a terminal.** The behaviour has not been studied. What is
  known: readers handle the alternative buffer poorly — and that is precisely the
  screen where moving an identity happens, where a mistake costs the identity.
- **60 columns.** The width is designed for 80; what exactly breaks at 60 has not
  been checked. It is checked by running, not by reasoning.
- **`NO_COLOR`.** The variable is a standard and the support is not written. While
  colour carries meaning (fading, mine versus theirs), ignoring it means losing
  state.

### What checks this

Two checks exist and both already gate a deploy: the landing's contrast and dead
translation keys. The application will need two more, and they have to be written
**with the first screen** rather than after the twentieth:

- the contrast of the application's tokens across all three steps and both themes;
- a keyboard pass: from the first element to submitting a form without a mouse.

## Part three: languages

### What gets translated and what does not

| Layer | Languages | Who translates |
|---|---|---|
| the landing and the legal texts | 17 and 10 | done; corrections by machine translation under the clause (2026-08-27) |
| the application's strings | the same | not started |
| **the feed's content** | any | **never** translated |
| the terminal | one, chosen at first run | not started |

**Content is not translated, and that is a decision.** A neighbour's phrase is
shown as written; language is a filter, not a translation. Auto-translating other
people's speech in a neighbourhood service would mean a person reads something
other than what was said and does not know it.

### What follows for the layout

- **German is about a third longer than Russian**, and Finnish and Hungarian
  produce words that do not break. A button drawn for "Say" has to survive
  "Veröffentlichen".
- **Georgian, Armenian and Greek** are other scripts with other line heights; a
  line spacing eyeballed on Cyrillic breaks there.
- **There is no right-to-left script** on either storefront, and that is the set of
  languages rather than an oversight. When one appears it will be work of its own,
  not "add `dir`".

### Keys and dead strings

The dictionary is shared (`landing/i18n-dictionary.mjs`) and already has a check
for keys nobody renders: it found one on the second storefront. For the
application the rule is the same: **a key with no place on a screen is a string
somebody translated into seventeen languages for nothing**.

## Open

- **The order of work:** translate the application's strings screen by screen, or
  in one pass at the end. The first gives a translator twenty small orders, the
  second one large order — but only after the layout has been approved for a
  single language.
- **Who translates the application's strings.** For legal texts the decision is
  made (machine translation under the clause); for an interface no such clause
  exists, and a bad string in a button is seen every day.
- **Contrast steps in the terminal.** The web has three; a terminal depends on the
  emulator's theme, and what "increased contrast" means there is undecided.
- **The three `depth-client` questions** above: the screen reader, 60 columns,
  `NO_COLOR`.
