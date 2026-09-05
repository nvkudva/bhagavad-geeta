---
name: translator
description: The three ways text gets into this corpus in a new language — find an existing licensed human translation, generate it with an online frontier model, or generate it locally with IndicTrans2 — plus how to merge it with provenance and verify it. Use this skill whenever text needs to be produced or replaced in Kannada, Telugu, Hindi or any other language: filling a gap like context_kannada or commentary_telugu, translating commentary or word-by-word glosses, replacing a machine translation with a better one, choosing between a paid API and a free local model, or deciding whether a source's licence permits use at all. Both update-language and onboard-language delegate the actual text production here, so reach for it whenever the question is "how do I get this text", even if the surrounding task is larger.
---

# Getting text into the corpus

Three routes. They are not equal and they are not interchangeable — the right
one depends on the register of the text and on what licences exist for the
language. Pick deliberately, and record which you used.

Whatever you pick, the output shape is the same: a JSON object keyed
`"chapter.verse"`, e.g. `{"1.1": "…", "2.47": "…"}`. That is what
`merge-language.mjs` consumes, so all three paths converge on the same merge and
the same verification.

## Path 1 — find an existing human translation

Always try this first. A published translation by a named translator beats
anything generated, and it is the only route that gives the reader a real
scholarly rendering rather than an approximation.

The bar is licence, not availability. `scripts/data-sources/README.md` records
what was already searched and rejected — read it before repeating a search.
The rules that matter:

- **Public domain in India** = author died more than 60 years ago.
- **CC BY / CC BY-SA** are usable with attribution carried in the `_source` field.
- **CC BY-NC is not usable** — it forecloses ever monetising the app.
- **Any ND variant is not usable** — this corpus splits every source into 701
  verses, which is exactly the derivative ND forbids.
- **An unstated licence is all rights reserved.** So is a `publicdomain/mark`
  applied by an uploader who is not the rights holder — a real trap this project
  already hit with a Prabhupada upload.

Where to look: language Wikisources, archive.org (check `licenseurl` and
`rights`, and distrust uploader-applied marks), and university digitisations.
Watch for OCR quality — the 1869 Kannada edition was public domain but its
Tesseract text destroyed the verse boundaries, which made it unusable anyway.

If you find one, model the fetcher on
`scripts/data-sources/fetch-telugu-wikisource.mjs`. The part worth copying is
that it asserts a per-chapter verse count and exits non-zero when one drifts, so
an upstream edit fails loudly instead of silently misaligning a chapter.

**Record the outcome either way.** A documented "no usable source exists, here
is what I checked and why each failed" is a real deliverable — it is what
justifies generating the text instead, and it stops the next person repeating
the search. `TODO.md:100` is a good example for Hindi.

## Path 2 — generate with an online frontier model

Best quality, costs money. Use it when the text carries doctrinal weight —
bhāṣya commentary especially — where the alternative is worse than nothing.

`scripts/bakeoff/run-claude.mjs` is the runner. It needs `ANTHROPIC_API_KEY`.
`scripts/bakeoff/prompt.mjs` holds the production prompt, and its shape is the
part worth understanding: each verse is given the Sanskrit, the English, and
**the already-published translation of that same verse in the target language**.
That anchor is what lets a model match register — the new text has to sit
directly beneath the existing translation in the reader without sounding like a
different book.

Cost scales with output, and Indic scripts tokenise expensively. The full
commentary corpus in two languages is roughly 1.7M characters of output — on
the order of $45 at Opus rates. Keep the system prompt byte-identical across
calls so it caches; that is the single biggest saving.

**Model choice is not free.** See `references/translation-quality.md`: a smaller
frontier model substituted everyday vocabulary for Sanskrit technical terms in
8 of 8 measured occurrences, while passing every mechanical check.

## Path 3 — generate locally with IndicTrans2

Free, no API key, runs offline once cached. Good on plain expository prose and
unreliable on exactly the vocabulary scripture is made of, so it is a draft
generator and a checker rather than a finisher.

```
python scripts/data-sources/translate-indictrans2.py \
  --source-field commentary_english \
  --target-field commentary_kannada \
  --lang kan_Knda \
  --out scripts/data-sources/commentary-kannada-mt.json
```

It skips verses that already have the target field, resumes after an interrupt,
sorts by length before batching, and preserves paragraph structure exactly —
which matters because the reader renders commentary with `white-space: pre-line`.
Use `--limit 2` for a trial run before committing to the full pass.

Environment (**the versions are load-bearing**):

```
uv venv --python 3.12 .venv-it2
uv pip install --python .venv-it2/bin/python \
    torch "transformers==4.46.3" sentencepiece IndicTransToolkit
```

- **Python 3.12**, not 3.14 — `tokenizers` has no 3.14 wheel and the Rust build fails.
- **transformers 4.46.3** — newer versions break IndicTrans2's vendored
  `modeling_indictrans.py`. The tempting workaround, `use_cache=False`, measured
  **32× slower**; leave the cache on.
- The model repo is **gated** on HuggingFace (MIT licence, instant approval):
  needs `HF_TOKEN` and a one-time click to accept.
- On CUDA, check `torch.cuda.get_device_capability()` matches the card —
  Blackwell (RTX 50xx) is `sm_120` and needs a CUDA 12.8+ build.

**Do not use it for word-by-word glosses.** Measured on `context_english`, whose
`headword—meaning; headword—meaning` shape is not sentence-like: it produced
ಪಾಶ್ಯ for *paśhya* (should be ಪಶ್ಯ), mangled *mahā-iṣhu-āsa* into ಮಹಾ-ಇಸು-ಆಸ,
and rendered the English word "here" phonetically as ಹಿಯರ್ instead of
translating it. Glosses need path 1 or 2.

## Merge and verify — the same for all three paths

```
node scripts/data-sources/merge-language.mjs \
  --input scripts/data-sources/<file>.json \
  --field <target_field> \
  --script <kannada|telugu|devanagari|…> \
  --source "<a sentence a reader would understand>" \
  --machine-flag \
  --dry
```

Run `--dry` first and check the count. It refuses to write unless every entry is
≥92% in the declared script with no foreign Indic block, because a wrong-script
merge is invisible in JSON and only shows up as mojibake in the reader. Pass
`--min-length 0` for glosses and `--allow-partial` for a partial backfill.

`--source` lands on every verse as `<field>_source` and is shown to the reader,
so write a sentence, not a code. Generated text takes `--machine-flag` too.

Then the pipeline, which runs as a unit because an import re-introduces what
`fix-corpus` removes:

```
node scripts/data-sources/fix-corpus.mjs
node scripts/data-sources/check-corpus.mjs     # must report 0 blocking defects
node scripts/build-data.mjs
node scripts/check-size.mjs
```

`check-corpus` proves the data is well-formed, not that it is *right*. Before
accepting generated text, read `references/translation-quality.md` and run the
two checks that catch what script-purity cannot: **cross-script codepoint
agreement** (for Kannada/Telugu, `telugu = kannada - 0x80` holds exactly) and
**back-translation** against the English source.
