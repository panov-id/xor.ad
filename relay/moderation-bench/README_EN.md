# The moderation measurement bench

This is where we decide what moderation is built from — with numbers rather than
argument. It is not part of the product: nothing here reaches the relay until the
measurement says what to install.

## Why it exists

Perspective API closes on 2026-12-31 (see [`../../docs/vendors-dpa_EN.md`](../../docs/vendors-dpa_EN.md)),
and moderation is to be done by our own model on our own node. That removes a
processor from the privacy policy outright: the text of a message never leaves our
infrastructure, no agreement is needed with anyone, and no cross-border transfer
arises.

What stays open is **any language**. People write in whatever they write in, and
guard models know few languages: Llama Guard 3 1B knows eight, and neither Russian
nor Greek is among them.

## What is being measured

A pipeline of five layers, where none of them lets anything through silently:

| Layer | What it does | What it is |
|---|---|---|
| 1. Normalization | NFKC, invisible characters, stretched letters, leetspeak | our own code |
| 2. Language identification | 218 languages, in the codes the translator expects | NLLB LID |
| 3. Lexicon **on the original** | catches local profanity before translation smooths it | Toxicity-200, 200 languages |
| 4. Translation into English | this is the answer to "any language" — 200 of them | NLLB-200 distilled 600M |
| 5. Guard model | one language to get right | Llama Guard 3 1B |

The order of layers 3 and 4 is the central decision of the whole arrangement.
Machine translation is trained to produce fluent text and **launders profanity**: a
crude word comes back as a polite dictionary equivalent. So the lexicon reads the
original, before the translation.

What makes the decision — not the model — is `decide()` in
[`pipeline.py`](./pipeline.py): fail-closed. Language unidentified, translation
failed, model silent: nothing is published. There is no path where a message
passes because it was not understood.

## Running it

```sh
scripts/run-moderation-bench.sh build   # build the image, start the guard
scripts/run-moderation-bench.sh run     # run the pipeline over samples.jsonl
scripts/run-moderation-bench.sh shell   # a shell inside the container
scripts/run-moderation-bench.sh clean   # tear down, model caches included
```

Everything is in Docker: no model, dataset or Python package is installed on the
machine. The container is given **three cores and 6 GB** — the same as the
production node (Hetzner cpx22), otherwise the latency figure would describe
different hardware.

Ollama listens on `127.0.0.1` only: the model must not be reachable from outside,
not even on a development box.

## About `samples.jsonl`

It is a **smoke set, not a measurement**. Its job is to prove that every layer
runs, and that a language nobody declared (Thai, Arabic) still goes through the
pipeline. Its labels are mine, and quality must not be measured against them: that
would be marking a model against an exam written by the marker.

Real numbers come from human-labelled datasets — step 2.

## What we actually measure, and what we do not know

Four levels of confidence, each called by its own name:

| Level | What it measures | Languages |
|---|---|---|
| Human labels | OGTD, Jigsaw, GermEval, PolEval, HatEval | en, ru, de, es, fr, el, pl · weaker uk, ro |
| Transfer | an English labelled set → translated into the language → back through the pipeline | all 200 |
| Lexicon coverage | mechanically, from the lists | all 200 |
| Reports | after launch every report is a human label in its own language | whichever people write in |

The second level answers "does an insult survive the round trip through
translation". It does **not** answer "does the model know local slang" — written
here so it does not get lost inside an average.

Eight of the seventeen declared languages (az, be, hy, ka, kk, ky, tg, uz) have no
public labelled data at all. For those, only levels 2–4 exist.

## What is not here yet

- **Transliteration** of Greeklish and of latinized Russian back into their own
  alphabets. The most valuable addition to the first layer; not done, and the code
  says so plainly rather than hiding it.
- The Toxicity-200 lists are fetched by [`fetch_resources.py`](./fetch_resources.py);
  if they cannot be fetched it fails loudly — it will not quietly run on four
  layers instead of five.

## Read together with

- [`../../docs/vendors-dpa_EN.md`](../../docs/vendors-dpa_EN.md) — why we left Perspective.
- `00-mechanics_EN.md` §5 in both storefronts — what moderation promises people.
- [README_RU](./README_RU.md)
