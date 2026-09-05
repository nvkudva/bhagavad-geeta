---
name: translator
description: The three ways text gets into this corpus in a new language — find an existing licensed human translation, generate it with an online frontier model, or generate it locally with IndicTrans2 — plus how to merge it with provenance and verify it. Use this skill whenever text needs to be produced or replaced in Kannada, Telugu, Hindi or any other language: filling a gap like context_kannada or commentary_telugu, translating commentary or word-by-word glosses, replacing a machine translation with a better one, choosing between a paid API and a free local model, or deciding whether a source's licence permits use at all. Both update-language and onboard-language delegate the actual text production here, so reach for it whenever the question is "how do I get this text", even if the surrounding task is larger.
---

# Getting text into the corpus

Three routes. Pick deliberately and record which you used.

| path | use it for | cost |
|---|---|---|
| 1. Find a human translation | anything, if the licence allows | free, often unavailable |
| 2. Online frontier model | bhāṣya, glosses, anything doctrinal | ~$45 for the full commentary |
| 3. IndicTrans2 locally | plain prose drafts, back-translation checks | free |

All three produce the same output shape — a JSON object keyed `"chapter.verse"`:

```json
{ "1.1": "…", "2.47": "…" }
```

That is what `merge-language.mjs` reads, so every path ends at the same merge and
the same checks.

---

## Path 1 — find an existing human translation

Try this first. A published translation by a named translator beats anything
generated.

### Licence rules

| licence | usable? |
|---|---|
| Public domain in India (author died 60+ years ago) | yes |
| CC BY, CC BY-SA | yes, with attribution in the `_source` field |
| CC BY-NC | **no** — forecloses ever monetising the app |
| Any ND variant | **no** — this corpus splits sources into 701 verses, which is the derivative ND forbids |
| No licence stated | **no** — that means all rights reserved |
| `publicdomain/mark` applied by an uploader | **no** — only the rights holder can apply it |

That last row is a real trap this project already hit, with a Prabhupada upload
on archive.org.

### Where to look

- Language Wikisources.
- archive.org — check the `licenseurl` and `rights` fields, not the description.
- University digitisations.

### Also check OCR quality

A public-domain scan is useless if the text is unusable. The 1869 Kannada
edition was correctly licensed but its OCR destroyed the verse boundaries.

### If you find one

- Model the fetcher on `scripts/data-sources/fetch-telugu-wikisource.mjs`.
- Copy its most important behaviour: it asserts a per-chapter verse count and
  exits non-zero if one drifts, so an upstream edit fails loudly instead of
  silently misaligning a whole chapter.

### If you don't find one

Write down what you checked and why each source failed, then use path 2 or 3.
That record is a real deliverable — it justifies generating the text and stops
the next person repeating the search. `TODO.md:100` is the worked example, for
Hindi.

---

## Path 2 — generate with an online frontier model

Best quality. Costs money. Use it for text carrying doctrinal weight.

- Runner: `scripts/bakeoff/run-claude.mjs`. Needs `ANTHROPIC_API_KEY`.
- Prompt: `scripts/bakeoff/prompt.mjs`.
- Cost: roughly **$45** for the full commentary in two languages at Opus rates
  (~1.7M characters of output; Indic scripts tokenise expensively).

Two things that matter:

- **Give each verse the already-published translation of that same verse.** It
  anchors the register, so the new text sits under the existing translation
  without sounding like a different book.
- **Keep the system prompt byte-identical across calls** so it caches. This is
  the single biggest cost saving.

**Choose the model deliberately.** A smaller frontier model replaced Sanskrit
terms with everyday words in 8 of 8 measured cases, and passed every automated
check while doing it. See `references/translation-quality.md`.

---

## Path 3 — generate locally with IndicTrans2

Free, no API key, offline once the model is cached.

```bash
python scripts/data-sources/translate-indictrans2.py \
  --source-field commentary_english \
  --target-field commentary_kannada \
  --lang kan_Knda \
  --out scripts/data-sources/commentary-kannada-mt.json
```

What the runner does for you:

- Skips verses that already have the target field.
- Resumes after an interrupt — rerun the same command.
- Sorts by length and batches to a **token budget**, which is the main
  throughput win. Do not reach for a sentence-count batch size; see below.
- Splits sentences the way this corpus actually punctuates, including the 974
  places where the space after a full stop is missing.
- Breaks any sentence too long for the model's 256 positions instead of letting
  `truncation=True` silently drop its tail.
- Preserves paragraph count, order, and the exact run of newlines between
  paragraphs (the reader uses `white-space: pre-line`, so a collapsed blank
  line is a visible change).
- Prints the merge command to run next.

Use `--limit 2` for a trial run first.

### Measured on an RTX 5090, 2026-09-05

700 verses of `commentary_english`, 7,627 sentences, into both languages:
**15,264 translations in 9.3 minutes at 27.5 sentences/sec**, bf16, beam 5,
1,500-token budget, 5.5 GiB peak. Budget out to 12,000 changes throughput by
under 10% while peak VRAM goes to 23 GiB, so the small end is free.

Greedy (`--beams 1`) is 5.3x faster and changes 55% of sentences. It is not
worse on the failures that matter, but it is not better either, and beam 5
costs ten minutes on the whole corpus — take the quality.

### Two traps, both silent

- **`IndicProcessor` pairs `preprocess_batch` with `postprocess_batch` through
  an internal FIFO of placeholder maps.** Preprocess the whole corpus up front,
  postprocess it in length-sorted order, and the queue desynchronises: the
  process wedges with no error, no traceback, and 0% CPU and GPU. They must
  bracket the same batch. The runner does this; keep it that way.
- **Oversized batches do not raise under WSL.** Beam memory scales with batch x
  longest-sentence-in-batch. At 256 sentences the long tail of this corpus asks
  for ~60 GiB on a 32 GB card, and instead of failing the driver spills to host
  memory over PCIe — throughput falls from 21 to 0.56 sentences/sec and looks
  exactly like a hang. The runner caps the process at 92% of VRAM so this
  surfaces as an OOM. Also check nothing else holds the GPU: an LM Studio or
  llama.cpp server left resident causes the same symptom.

### Setup

```bash
uv venv --python 3.12 .venv-it2
# On an RTX 50xx the index is not optional: Blackwell is sm_120, and the
# default wheel has no kernels for it. Verify before going further —
#   python -c "import torch; print(torch.cuda.get_device_capability())"
# must print (12, 0), not fall back to CPU.
uv pip install --python .venv-it2/bin/python \
    torch --index-url https://download.pytorch.org/whl/cu128
uv pip install --python .venv-it2/bin/python \
    "transformers==4.46.3" sentencepiece IndicTransToolkit
```

These versions are required — see the table in
`references/translation-quality.md` for what breaks otherwise.

The model repo is **gated** on HuggingFace (MIT licence, instant approval):
set `HF_TOKEN` and accept the terms once in a browser.

### Do not use path 3 for word-by-word glosses

Measured on `context_english`, it produced ಪಾಶ್ಯ for *paśhya*, mangled
*mahā-iṣhu-āsa*, and spelled the English word "here" phonetically as ಹಿಯರ್
instead of translating it. The gloss format is not sentence-shaped, which is
what the model expects. Use path 1 or 2 for glosses.

---

## Merge — the same for all three paths

```bash
node scripts/data-sources/merge-language.mjs \
  --input scripts/data-sources/<file>.json \
  --field <target_field> \
  --script <kannada|telugu|devanagari|…> \
  --source "<a sentence a reader would understand>" \
  --machine-flag \
  --dry
```

- **Run with `--dry` first** and check the count, then rerun without it.
- It refuses to write unless every entry is ≥92% in the declared script with no
  other Indic script present. A wrong-script merge is invisible in the JSON and
  only appears as mojibake in the reader.
- `--source` lands on every verse as `<field>_source` and is shown to the reader.
  Write a sentence, not a code.
- Add `--machine-flag` for generated text.
- Add `--min-length 0` for glosses (they are short).
- Add `--allow-partial` for a deliberate partial backfill.
- If the script is not in the `SCRIPTS` table, add its Unicode block — one row.

## Then run the pipeline

These run as a unit, because an import re-introduces what `fix-corpus` removes:

```bash
node scripts/data-sources/fix-corpus.mjs
node scripts/data-sources/check-corpus.mjs     # must report 0 blocking defects
node scripts/build-data.mjs
node scripts/check-size.mjs
```

## Then verify what the checks cannot see

`check-corpus` proves the data is well-formed. It does not prove the text is
correct. Run the defect scan **before** merging, while the output is still a
staging file:

```bash
node scripts/data-sources/check-translation.mjs \
  --source commentary_english \
  --kannada scripts/data-sources/commentary-kannada-mt.json \
  --telugu  scripts/data-sources/commentary-telugu-mt.json
```

It reports a clean/total count and every defect: script purity with scholarly
citations excluded, Devanagari leakage, untranslated English words, paragraph
count against the source, length ratio, the cross-script codepoint check, and
ದ್ವೇಶ-class misspelling pairs. Pass one language or both; the cross-script check
needs both.

Then, still:

- Read `references/translation-quality.md`.
- Run the back-translation described there.
- Spot-check a stratified sample: short and long verses, every commentator.

**A clean scan is not an accepted translation.** On the 2026-09-05 commentary
run it reported 661/700 clean while the eight verses that quote the Upanishads
in Devanagari had lost their quotations entirely — the check passed *because*
the Devanagari was gone.
