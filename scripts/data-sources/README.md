# Data sources

Import scripts and their raw output. These run by hand, not in the build — the
build reads `src/data/verses.json`, which is the checked-in result.

## The pipeline, in order

Run it end to end, or not at all: an import re-introduces the defects that
`fix-corpus` exists to remove, so `fix-corpus` must always follow a merge.

```
node scripts/data-sources/fetch-telugu-wikisource.mjs   # -> telugu-wikisource.json
node scripts/data-sources/merge-telugu.mjs              # -> verses.json
node scripts/data-sources/merge-kannada.mjs             # -> verses.json
node scripts/data-sources/fix-corpus.mjs                # mechanical repairs, idempotent
node scripts/data-sources/check-corpus.mjs              # must report 0 blocking defects
node scripts/build-data.mjs                             # -> public/data/v1
```

`fix-corpus.mjs --dry` reports without writing; `check-corpus.mjs --verbose`
lists the verse ids behind each count. `check-corpus` exits non-zero on a
blocking defect and zero on a warning — the standing warnings are recorded at
the bottom of this file, so a new one means something changed.

## Telugu — `fetch-telugu-wikisource.mjs`

Fetches all 701 verses from te.wikisource.org
("భగవద్గీత - తెలుగు అనువాదము", eighteen chapter pages), licensed CC BY-SA 4.0.

```
node scripts/data-sources/fetch-telugu-wikisource.mjs   # -> telugu-wikisource.json
node scripts/data-sources/merge-telugu.mjs              # -> src/data/verses.json
```

The fetch asserts a per-chapter verse count and exits non-zero if any chapter
drifts, so a page edit upstream is caught rather than silently mis-aligning the
whole chapter. Chapter 13 has 35 sections there, which is the same recension
this app carries — 701 verses, not 700.

Each page is a flat list of `===pratīka===` sections in verse order. A section
body is the Sanskrit śloka in Telugu script closed by a `|| c-v ||` marker, then
the Telugu prose. The source is hand-typed and inconsistent about that marker,
so the parser falls back through three patterns and then strips the chapter
colophon and stray pipes.

`translation_telugu_source` is written onto every verse so the licence
attribution travels with the data.

## Kannada — no open source exists

Two searches, both dead ends. Recorded here so nobody runs them a third time.

**Openly-licensed datasets.** kn.wikisource carries only the Sanskrit in
Kannada script, plus one 500-page scan whose every page is `pagequality=1`
(unproofread OCR, `ಕರಯೋಗ` for `ಕರ್ಮಯೋಗ`). The single 701-verse Kannada dataset on
GitHub is unlicensed and, by its own repo contents, itself machine-generated.
HuggingFace's Gita dumps carry `script-kn` columns — Sanskrit transliterated
into Kannada, which this corpus already has. gitasupersite.in exposes no data
API and is IIT-Kanpur copyright.

**Public domain in India** (life + 60, so an author dead by 1965). The only
text with both clean rights and the right per-verse prose shape is
`shn.bhagavadgita0000muns` — Munshi Srinivasaiya, ed. J. Garrett, Mysore
Government Press, 1869. Its `_djvu.txt` is Tesseract on 1869 letterpress at
roughly 70–80% word accuracy, with the `ಉವಾಚ` and numeral verse boundaries
mostly destroyed, so verse segmentation is not recoverable without a fresh
vision OCR pass and line-by-line proofreading — and the result would be 1869
orthography. The "Karnataka Bhagavadgita" scans (1936, and Basavanal) are the
16th-century ṣaṭpadi metrical rendering, whose verses do not map to the ślokas
at all.

**In copyright.** Bannanje Govindacharya, Chinmayananda. Satchidanandendra
Saraswati's volumes are CC BY-NC-ND, and ND forbids the verse-splitting
derivative this app would be. Prabhupada's Kannada edition on archive.org
(`bhagavadgita-srila-prabhupadas-books`) is a 2021 personal upload with no
`licenseurl` and no `rights` field, which means all rights reserved — it is
Bhaktivedanta Book Trust text, in copyright in India until 2037. A second
upload of the same text carries a `publicdomain/mark/1.0` applied by its
uploader; that mark is simply wrong and must not be relied on.

**Conclusion.** `translation_kannada` is machine-assisted, rendered from the
Sanskrit with the English and the Telugu alongside it, deliberately without
reference to any copyrighted Kannada edition. Every verse carries
`translation_kannada_source` saying so, and the reader sees "AI translated"
under the translation.

`translation_kannada` is therefore machine-assisted, rendered from the Sanskrit
with the English and the Telugu alongside it, and every verse carries
`translation_kannada_source` saying so. The reader is told in the UI.

## Standing warnings

`check-corpus.mjs` reports these every run. They are known and deliberate, not
a to-do list — investigate only if a count moves.

- **220 ambiguous `?`** in `commentary_english`. The Sivananda mirror this
  corpus came from replaced 3,805 commas with `?` and deleted every `qu`
  digraph. Both were repaired mechanically; these 220 sit before a capital
  letter, where a comma and a genuine question mark are indistinguishable
  without the original edition.
- **664 non-IAST transliterations.** The corpus uses a consistent hybrid
  scheme (`ṛi`, `ṣh`, `śh`, `ch`) rather than strict IAST. Consistency makes it
  a scheme decision, not a defect; converting all 701 is a separate call.
- **6 combined-verse groups** — 1.32–34, 1.38–39, 2.42–43, 5.8–9, 5.27–28,
  10.12–13 — where the source edition translates several ślokas as one unit and
  repeats that unit under each id. Correct, but the reader is not told; marking
  it needs a schema field.
- **3 Telugu verses are composed, not imported.** te.wikisource left 1.13 with
  no translation at all (only a bhāṣya, now in `context_telugu`), 2.23 with one
  of its four clauses, and 16.2 with 6 of its 11 qualities. All three were
  composed from the Sanskrit in the register of the verses either side of them,
  and carry `translation_telugu_machine: true` — the one provenance field that
  ships, so the reader sees "AI translated" on those three instead of the Wikisource
  credit. 2.55 and 15.16 had commentary running straight on
  from the translation with no bhāṣya heading for the parser to find; the tail
  was moved to `context_telugu` rather than discarded.
- **13.1 `translation_english`** is an editorial note — the English edition
  omits the verse that opens this recension's chapter 13. Left as it stands,
  because it is honest about itself.
- **70 `commentary_english` nulled.** They held Devanagari word-gloss lists,
  not commentary. Every one of those verses still has `context_english`, so no
  verse lost its whole reference section.
- **Two more found in the residue and fixed (2026-09-05).** 1.15 was the same defect
  in full — a gloss list tailed by "No Commentary." — and is now nulled; 10.7 had the
  gloss list pasted in FRONT of real prose and had the run stripped. Both are handled
  by `fix-corpus.mjs` and asserted by `check-corpus.mjs`
  (`A-devanagari-gloss-run-in-commentary_english`).
- **Eight verses carry Devanagari inside `commentary_english` and are CORRECT:**
  13.21, 13.31, 15.6, 15.7, 15.9, 15.14, 17.8, 17.15. They quote the Chhandogya,
  Katha and Brihadaranyaka Upanishads, the Manu Smriti, and the कारण/करण pair, in
  script, inside English prose. Do not write a rule that strips Devanagari from
  commentary — it will eat these. The remaining problem there is a *rendering* one:
  the commentary block is set in a Latin reading face, so these runs fall back to
  the system Devanagari face mid-paragraph.


## Commentary — machine-translated into Kannada and Telugu

`commentary_english` exists for 700 of the 701 verses and had no counterpart in
either target language. Both are now drafted by IndicTrans2 into staging files
that nothing in the build reads yet.

```
python scripts/data-sources/translate-indictrans2.py \
  --source-field commentary_english --target-field commentary_kannada \
  --lang kan_Knda --out scripts/data-sources/commentary-kannada-mt.json

node scripts/data-sources/check-translation.mjs --source commentary_english \
  --kannada scripts/data-sources/commentary-kannada-mt.json \
  --telugu  scripts/data-sources/commentary-telugu-mt.json
```

**Model.** `ai4bharat/indictrans2-en-indic-1B`, revision
`10e65a9951a1e922cd109a95e8aba9357b62144b`, MIT licence, gated on HuggingFace
with instant auto-approval. Run 2026-09-05 on an RTX 5090 under
torch 2.11.0+cu128, transformers 4.46.3, Python 3.12: bfloat16, beam 5, batches
formed to a 1500-token budget with sentences length-sorted first. 700 verses,
1,627 paragraphs, 7,627 sentences, 7,632 pieces after long-sentence splitting.

`.claude/skills/translator/` holds the operational detail — the version pins,
the two silent traps (IndicProcessor's pre/post FIFO, and oversized batches
spilling to host memory under WSL instead of raising), and the measured
throughput table.

**Provenance.** Output is keyed `"chapter.verse"`, the shape
`merge-language.mjs` consumes. `verses.json` is untouched until the merge, which
writes `commentary_<lang>_machine: true` and a `_source` string naming the model.

### Quality — what this output is and is not

Measured against Claude Opus on the same verses, before this run:

- **Sivananda's expository prose (630 verses) is mostly shippable.** This is
  what the model is good at.
- **Sanskrit technical vocabulary is unreliable.** For "Dvesha or aversion" it
  writes ದ್ವೇಶ — ಶ where ಷ belongs — then translates the gloss to the correctly
  spelled ದ್ವೇಷ, so the reader gets a misspelling, "or", and the same word
  spelled right. The misspelling runs wider than the flagged pairs: ದ್ವೇಶ /
  ద్వేశ appears 11 times across 8 verses, always wrong, while the gloss beside
  it is always right. That is a mechanical fix.
- **Bhāṣya fails structurally.** Śaṅkara (22) and Rāmānuja (48) use a technical
  register the model flattens: karma/akarma come out as everyday
  ಕ್ರಿಯೆ/ನಿಷ್ಕ್ರಿಯತೆ, losing the pair, and "organs" as ಅಂಗಗಳ, body parts,
  where ಇಂದ್ರಿಯ, sense-organs, is meant. Those 70 verses should be regenerated
  by a frontier model, not merged from here.

None of this is fixable by re-running with different settings. Greedy decoding
was benchmarked alongside beam 5 — 5.3x faster, and it changes 55% of sentences
without being better or worse on the failures above.

### What `check-translation.mjs` cannot see

Blocking classes report zero: no missing verses, no Devanagari leaked into the
output, no run of three or more Latin words, no paragraph count differing from
the English, no length ratio outside 0.55–1.9. Paragraph structure matters
because the reader sets commentary with `white-space: pre-line`.

Two things survive a clean report, and both need a human:

- **The eight verses that quote scripture in Devanagari lost the quotation.**
  13.21, 13.31, 15.6, 15.7, 15.9, 15.14, 17.8 and 17.15 carry Chhandogya, Katha
  and Brihadaranyaka lines, the Manu Smriti, and the कारण/करण pair, in script,
  inside English prose. The model rendered them as ordinary prose in the target
  language instead of preserving them. Nothing flags this — the Devanagari check
  passes precisely because the Devanagari is gone. Restore those runs verbatim
  before merging.
- **A handful of verses carry a single untranslated English word**, always glued
  to a citation marker — `heaven.-Tr`, `self.-Tr`, `support.-V.S.A` — so the
  tokenizer never saw a word to translate. Scholarly citations that are meant to
  stay in Latin (`Cf.XVIII.17`, `B. S. 1.1.11-19`, `cf. Br. 4.4.22`) are
  excluded from the purity ratio and are correct as they stand.
