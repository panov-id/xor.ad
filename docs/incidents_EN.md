# Incident log

Kept under Art. 33(5) GDPR: **every** personal data breach is recorded, not only
those notified to the authority. The steps are in
[`breach-procedure_EN.md`](./breach-procedure_EN.md).

An empty log is a normal state; a missing log is not.

The first entry is below, and it is about us: the leak was found by a review
panel rather than by a person, and closing it took two steps — the node and the
cache.

| Discovered | What happened | Whose data | Authority | People | What was done |
|---|---|---|---|---|---|
| 2026-09-10, ~14:25 UTC | Production served `/metrics` without a token on three names of one node; the series labels carried **three real Article 16 notice identifiers**, along with counters by brand, route and admin path | notifiers and authors of three reports about illegal content | **not notified** — identifiers without content or names, the risk to people's rights is not high; the decision is recorded here as Art. 33(1) requires | no (Art. 34 requires high risk) | The `METRICS_TOKEN` was written on 2026-09-08 and never deployed; the label was built from the raw path. On 2026-09-11 production was rolled to `v2026.9.11-g8f89e7a`: `/metrics` answers 404 without a token and the label is the route pattern. The Bunny cache on zones `xorad-report-prod` and `xorad-api-prod` was purged separately — it kept serving a copy for a day after the node was fixed, with a 30-day `max-age`. Verified live on all three hosts: 404, no identifiers |

that hour is written down at once: the 72 hours run from it.
