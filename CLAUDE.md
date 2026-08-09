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
