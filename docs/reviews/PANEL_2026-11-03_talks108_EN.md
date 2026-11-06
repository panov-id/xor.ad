# Panel 03.11.2026: screens 108/109, talks list

One lens only: security (fable, session 666223e0, agent ab0dc8a09aaa80d71). Written on 04.11 from its raw report. Lens coverage: 10 of 149 files, a number from the handoff, not recounted. This is not a review of the whole tree.

The lens ran on a scratch copy, read-only. It ran `inbox-empty.test.ts` and `inbox-list.test.ts` (2 pass, then 2 fail on a mutated copy) and probed the generator's regexes against the three archive files. It did not use the live stand.

## Result

No security defect.

## Defects

| Level | Place | Finding |
|---|---|---|
| medium | `app/tokens/wide.css:332` | The two-column rule styles only the skeleton `.k-tk-rows`; the real list is `.nd-talk-rows`, one column. Not checked visually by the lens. |
| low | `app/src/screens/talks/Inbox.tsx:99`, `talks-list.gen.tsx:24` | A row with no chat is `div role=button aria-disabled`: it stays in the Tab order and takes a click that does nothing. A crowd click on it passes silently (`crowd.mjs:453-455`). |
| weak test | `inbox-list.test.ts` | String matching on source; dropping `current=` went undetected. |
| nit | `scripts/design/nd4-extract.py:1094` | `chip` ignores `d`, so OfferChip loses the archive's `--d:2` stagger. |

## Looked at, not defects

- Peer name and line enter JSX through React escaping; `p.fade` comes from a share in 0..1.
- A wrong block cannot be taken silently: anchors match once and the guards stop the run.
- Selected row at wide widths is styled, with a fragile `!important`.
- Test ids used by the crowd are kept; `app.talks.*` keys are paired RU and EN.
- `.nd-update*` rules were removed as unused.

## Status on 04.11

None of the defects above is fixed. Talk block over the new head: 158 of 158 steps, run flow-1104-*, rc 0.
