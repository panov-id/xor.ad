# Design System (Draft)

## Sources

The recommendations below are based on a review of 2026 web/app design trends:

- [The Modern Color Palette: UI/UX Color Trends That Define 2026](https://recursion.software/blog/ui-color-trends-2026)
- [Top Web Design Trends for 2026 — Figma](https://www.figma.com/resource-library/web-design-trends/)
- [Neo-Brutalism design trends in 2026](https://pixso.net/articles/neo-brutalism-design/)
- [Neobrutalism — NN/G](https://www.nngroup.com/articles/neobrutalism/)
- [UX/UI design trends for 2026 — calm interfaces](https://elements.envato.com/learn/ux-ui-design-trends)

## Overall direction

The already-adopted principle of "black and white, high contrast, no decoration for decoration's sake" (see the README's Design section) lines up with the 2026 **neo-brutalism** trend — no need to change course, just sharpen it with concrete techniques:

- Hard borders (2–5px) instead of thin or absent ones.
- Sharp corners instead of rounded ones.
- Hard, un-blurred drop shadows rather than soft/gradient ones.
- The dark theme is designed first, the light theme derived from it (dark-first), not the other way around.
- Large, bold typography for headlines (loading screen, landing page) — one variable font covering the whole weight range, rather than several font files.

## Monochrome plus one accent color per face

Trend: rather than a full color palette, keep a monochrome black-and-white base and one accent color per brand (this is what Vercel does, for example).

### sosed.place — red

A reference to Soviet constructivism (Rodchenko: black/white/red on posters). Starting point: a saturated poster red, around `#CC0000`–`#DA291C` — the exact shade isn't finalized.

### neighbro.place — warm gold/bronze

Not the obvious "EU blue." The common thread across the UK/France/Germany and Cyprus/Greece (where the operator is legally based — see `legal/`) isn't a flag color but a warm metallic: copper (Cyprus — the island's name is the root of the word "copper"), the gold in Germany's tricolor, the bronze/gold of classical Greco-Roman aesthetics. Starting point: a warm gold/bronze, around `#B08D57`–`#A97142` — the exact shade isn't finalized.

## Open questions

- Exact accent color hex values are not finalized — needs visual selection, not just a text approximation.
- A specific variable font hasn't been chosen.
- Exact border-width/border-radius/shadow-offset values are not defined.
- Whether this direction applies 100% identically to both faces, or neighbro.place goes softer/thinner on borders, is not decided.
