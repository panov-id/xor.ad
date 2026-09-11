# What to do about a personal data breach — 2026-09-11

The seventy-two hours of Art. 33 GDPR run **from the moment it became known**, not
from the moment we decided to look into it. A procedure written after the event
does not give those hours back — so this one is written before.

It is deliberately short: at three in the morning people read what fits on a
screen.

## Who decides

The operator, Evgenii Panov. There is no second person, and that is a fact rather
than a caveat: there is nobody whose approval to wait for, so there is no reason
to delay either.

## What counts as a breach

Not "a hack" but any of the three in Art. 4(12): **loss** of availability,
**alteration**, or **disclosure** of personal data. The signs that mean exactly
that in this product:

- an outsider read what they should not: a public answer from an endpoint that
  must require a token; somebody else's identifier in what is handed out; a
  database dump in hands it does not belong to;
- data promised to be alive is gone: a wiped volume, lost backups;
- somebody else's writes where only we write: altered rows, forged answers.

**An example from this project rather than from a textbook.** On 2026-09-10 it
turned out production was serving `/metrics` publicly, with three real Article 16
notice identifiers in the series labels — that is, reports about illegal content.
That is a disclosure of personal data, and by this procedure it should have been
handled as an incident.

## The first hours

1. **Write down the time.** The moment it became known starts the clock. Write it
   down within the hour, not from memory the next day.
2. **Stop the leak.** Close the endpoint, revoke the key, deploy the fix —
   whichever is faster. Analysis later; the tap first.
3. **Gather what is known:** which data, how many people, since when, and by what
   sign this is visible. Where to look is below.
4. **Decide whether to notify** (next section), and if so — **notify within 72
   hours of step 1**.
5. **Record it in the incident log** — even if the decision was not to notify.
   Art. 33(5) requires a record of **all** breaches, not only the notified ones.

## Where to look

| What | Where | How long it lives |
|---|---|---|
| Node logs at `warn`/`error` | object storage, `server-logs/<env>/`, readable from the panel | a year |
| Logs at every level | on the box, `docker logs` | about a day, then rotation |
| The panel's action log | the audit table, visible to platform roles | the table's own retention |
| Node metrics | `/metrics` with the token | in process memory; a restart zeroes them |
| Backups | Bunny, the backup zone | 14 days |

The order is deliberate: `error` in storage outlives the box, while `docker logs`
is the only place where everything is visible and the first to disappear.

## Whom to notify, and when

**The authority.** The Office of the Commissioner for Personal Data Protection,
Cyprus — the supervisory authority of the controller's establishment. Within **72
hours** of the moment it became known. We skip it only if the breach is **unlikely**
to result in a risk to people's rights — and then the reason goes into the log,
because justifying it will be on us.

**The people (Art. 34).** If the risk is **high** — correspondence leaked, say, or a
vault share together with an identifier. Without undue delay and in plain
language. There is one exemption and it genuinely applies here: if the data was
encrypted and we hold no keys, the risk is not high — and that has to be
demonstrable.

**By what channel.** The product holds no resident's email — so there is one
channel: a line in the application at the next sign-in, the way an Art. 17
statement of reasons is delivered, plus a notice on the storefronts. The
limitation is named here so that it is not discovered during an incident.

## What we send the authority

Art. 33(3) asks for four things, and the template is exactly those:

1. **The nature of the breach:** what happened, the categories and approximate
   number of people and records.
2. **A contact point:** the operator, `support@sosed.place`.
3. **The likely consequences** for people.
4. **Measures taken and proposed**, including what mitigated it.

If not everything is known by the 72 hours — send what there is and follow up.
Art. 33(4) permits that explicitly; it does not permit silence until the picture
is complete.

## The incident log

The file `docs/incidents_EN.md`, one line per case: date and hour of discovery,
what happened, whose data, whether the authority and the people were notified,
what was done. An empty log is a normal state; a missing log is not.
