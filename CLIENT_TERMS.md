# Terms for client authors

**In force from 2026-08-10.** These terms apply to anyone who connects a client of
their own making to our nodes — a fork of `depth`, a rewrite, a script, anything
that speaks the protocol.

English only, and deliberately: a translated legal text is a second edition, and on
the day one of them is edited the two quietly start saying different things. The
same decision governs the storefront Terms and privacy policy.

## Why this document exists

The client is open and the protocol is documented. That is an invitation to write
your own, and we mean it as one. But an open client also means the node cannot
assume anything about what is on the other end of the connection, and the people
using your client are still our neighbours. This document says which side answers
for what.

## What the node guarantees

These hold for every client, ours or yours, because they live on the server:

- **rights are checked** on every request, and a signature the node does not accept
  gets nothing;
- **limits hold**: message length, request rate, the number of live phrases per
  identity;
- **the feed is moderated before publication**, through a queue rather than inside
  the request — `POST /feed` answers at once, the phrase stays invisible until the
  verdict, and text that does not pass is never published, whichever client sent
  it. Your client must show that waiting state instead of pretending the post is
  already live;
- **age bands are applied** to delivery and to matching.

None of this depends on your client behaving. That is the point: the node treats
every client as hostile by default.

## What the node does not guarantee

Everything above the protocol is yours:

- that a counter is drawn, that a limit is shown before it is hit, that an
  expiring chat warns anyone;
- that the Terms and the community guidelines are shown to the person using your
  client;
- that local history is erased when it should be;
- that anything at all is stored the way ours stores it.

If your client gets these wrong, the person using it is affected, and the answer to
"who did this" is you.

## What you must do

**Show the Terms and the community guidelines.** A person must be able to read what
they are agreeing to from inside your client, before they publish anything.

**Provide the Article 16 path.** Reporting illegal content must exist in every
client, reachable without leaving it. This is not a courtesy — a person who cannot
report is a person whose report we never receive, and the duty to act on notices is
ours.

**Do not collect our people's data.** Not their identity keys, not their messages,
not their locations, not a shadow copy of anything. A client that ships what it
sees to its author's server is not a client of ours, whatever it speaks.

**Do not hold other people's identity keys centrally.** The identity model rests on
the key living on the person's own device (`docs/chat_EN.md` §8.2). A client that
keeps everyone's keys in one place breaks that promise for every person using it,
including the promise we made.

**Do not work around the bands and the limits.** If you find a way past them, that
is a defect on our side and we would rather hear about it than see it used.

**Do not present your client as ours.** Do not use our names, wordmarks or domains
in a way that suggests we wrote it or vouch for it. Say plainly that it is yours.

## The client key

A client identifies itself to the node with a key. Ask us for one.

**This is not the key baked into the `depth` image.** That one is the brand's,
shared by every container in the world, and it is deliberately not revocable —
`docs/depth-client_EN.md` §2.5 replaces revocation with overlap there, because
pulling it would break every pinned digest running anywhere at once. A key issued
to you is yours alone, and it **can** be revoked without touching anyone else.

Revocation is what "we may cut you off" means in practice, and it is the only
enforcement mechanism here — there is no penalty, no claim and no procedure
beyond it. We will say why, and where the abuse is not deliberate we will say so
before revoking rather than after.

**Not built yet.** Per-author keys do not exist in the node's code today; the key
type they need is an open item (`docs/open-work_EN.md` G9). Until it lands there
is nothing to issue and nothing to revoke, and the only limits in force are the
ones per address and per identity. These terms are written ahead of the mechanism
on purpose, so that the mechanism is built to them.

## What we do not offer

**We do not host your network.** If what you want is your own world with your own
people, run your own node: the protocol is documented, the client is open, and the
node's source is in this repository. You are then the operator on your own
infrastructure, and we are not a party to it at all.

**We do not sign a data processing agreement.** There is no service for one to
cover: we do not process anything on your behalf. Asking us to host your network so
that you can stay out of the operator's chair would make us a processor for you —
Article 28, a sub-processor list, help with data subject requests, and roles to
untangle under the DSA — for a service that does not exist.

Hosting a separate world would also put a brand boundary back into the feed, which
the chat specification forbids as a matter of principle (`docs/chat_EN.md` §8, the
second principle): two people on one street see each other regardless of which face
brought them in.

## No warranty

The nodes are provided as they are. The protocol may change, a node may be
unavailable, and the service may stop. There is no uptime commitment, and none is
implied by a key having been issued.

## Changes to these terms

The date at the top moves when the text changes, and the change is described in the
commit that makes it. A key already issued keeps working across a change; if a
change makes an existing client non-compliant, that is said in the commit and there
is a window before it is enforced.

## Contact

Open an issue in this repository, or write to the address published on the
storefronts' documents page.
