---
name: onboard-language
description: End-to-end workflow for adding a new language to the Gita corpus, or filling in / replacing an existing language's text. Covers licence diligence, sourcing or generating the text, merging with provenance, the fix/check/build pipeline, and the code and font changes the reader needs. Use this skill whenever the work touches per-language data or UI — adding Hindi/Tamil/Marathi/any new language, backfilling a partly-empty field like context_kannada or commentary_telugu, replacing a machine translation with a better one, wiring up a new script's fonts, or any request phrased as "add <language>", "translate the commentary into X", "why is X missing for most verses", or "onboard a language". Reach for it even when the ask sounds like a small data edit, because per-language fields have provenance and script-purity obligations that are easy to violate silently.
---

# Onboarding a language

This corpus is 701 verses in a fixed recension, and each language is a set of
parallel fields on every verse. Adding one is less about translation than about
not breaking three things that are easy to break quietly: the licence story,
the script purity of the data, and the fonts that render it.

Work in this order. Steps 1–2 are where projects go wrong irreversibly; the
rest is mechanical and checkable.

## 1. Settle the licence before writing a line of code

`scripts/data-sources/README.md` is the record of why each language's text is
what it is, and it exists because two Kannada editions had to be rejected on
copyright grounds after being found. Read it first — the reasoning there is the
standard to meet, not a formality.

For a new language, establish one of these and write down which:

- **A cleanly-licensed source exists.** Public domain in India means the author
  died more than 60 years ago. CC BY and CC BY-SA are usable with attribution.
  **CC BY-NC and any ND variant are not**: NC forecloses ever monetising the app,
  and ND forbids the verse-splitting this corpus does to every source.
- **No usable source exists**, so the text will be machine-generated. This is a
  legitimate outcome — it is what Kannada did — but it must be recorded, carried
  in a `_source` field on every verse, and surfaced to the reader.

A licence that is merely unstated is *all rights reserved*, and a
`publicdomain/mark` applied by an uploader rather than the rights holder is
worth nothing. Both traps are documented in the README with real examples.

Append your findings to that README as a new section before moving on. A future
reader needs to know what you rejected and why, not just what you chose.

## 2. Choose how the text gets made

Three routes, in descending order of preference:

**Fetch a licensed source.** Model the fetch on
`scripts/data-sources/fetch-telugu-wikisource.mjs`. The thing worth copying is
that it asserts a per-chapter verse count and exits non-zero when one drifts, so
an upstream page edit surfaces as a failure instead of silently misaligning a
whole chapter.

**Generate with a strong model.** Highest quality, costs money or agent time.

**Generate locally with IndicTrans2.** Free and fast, but read
`references/translation-quality.md` before choosing it — the failure modes are
measured, specific, and concentrated exactly where scripture vocabulary lives.

Whichever route, produce a JSON object keyed `"chapter.verse"`:
`{"1.1": "…", "2.47": "…"}`. That is what the merge step consumes.

## 3. Merge with provenance

Use the generalised merge rather than writing another per-language copy:

```
node scripts/data-sources/merge-language.mjs \
  --input scripts/data-sources/hindi-machine.json \
  --field translation_hindi \
  --script devanagari \
  --source "machine-assisted — rendered from the Sanskrit" \
  --machine-flag \
  --dry
```

Run with `--dry` first; drop it when the count is what you expect. It refuses to
write unless every entry is ≥92% in the declared script and contains no other
Indic script, because a wrong-script merge is invisible in the JSON and only
appears as mojibake in the reader. For word-by-word glosses pass
`--min-length 0`; for a partial backfill pass `--allow-partial`.

If the script isn't in its `SCRIPTS` table, add the Unicode block there — one
row, and every later language benefits.

The `--source` string travels onto every verse as `<field>_source` and is what
the reader displays. Make it a sentence a user would understand, not a code.

## 4. Run the pipeline in full

An import re-introduces the defects `fix-corpus` exists to remove, so these run
together or not at all:

```
node scripts/data-sources/fix-corpus.mjs      # mechanical repairs, idempotent
node scripts/data-sources/check-corpus.mjs    # must report 0 blocking defects
node scripts/build-data.mjs                   # -> public/data/v1
node scripts/check-size.mjs                   # payload budget
```

`check-corpus.mjs --verbose` names the verses behind each count. It exits
non-zero on a blocking defect and zero on a warning; the standing warnings are
listed at the bottom of the data-sources README, so **a new warning means
something changed** and is worth reading rather than waving through.

## 5. Wire the language into the app

Read `references/code-touchpoints.md` for the file-by-file list. Two things
about the order of work:

**Start at `Language` in `src/lib/gita.types.ts:2`.** Widening that union turns
most of the remaining work into compiler errors, because the per-language string
tables are `Record<Language, …>` and stop compiling until every one has the new
key. Let the type checker enumerate the list instead of hunting by hand.

**Two places need real thought rather than another case.** `pick()` in
`VerseViewer.tsx:32-38` takes *positional* per-language arguments — a fourth
language wants it rewritten against the `SUFFIX` table in `src/lib/gita.ts:37`.
And the search row is a positional tuple whose offsets are declared in both
`src/lib/search.ts:8` and `scripts/build-data.mjs:191-196`; they must agree, so
**append** the new column rather than inserting one.

Don't forget `chapters.json` (`name_*`, `name_meaning_*`, `summary_*`) — separate
from the verse fields, and the omission shows up as a blank home screen.

**Fonts: check whether you need one at all.** `src/index.css:2403-2415` already
maps `[lang="hi"]` to the Devanagari face, so Hindi needs no new font — only
data and UI work. If the script genuinely is new, `scripts/subset-fonts.mjs`
generates the subset and prints the `@font-face` block to paste. Run it **after**
the merge and after the UI strings are written: it derives the subset by scanning
`src/data/*.json`, `src/**/*.tsx?` and `index.html`, so running it early
produces a font missing exactly the glyphs the new strings need.

**`TODO.md:100` already has the licence research done for Hindi** — the open
JSON datasets all carry in-copyright translations, hi.wikisource's scan is
unproofread, and the one public-domain human translation is Gandhi's
अनासक्तियोग (1930) at ~75-85% OCR. Read it before repeating that search.

## 6. Verify what the checks can't see

`check-corpus` proves the data is well-formed, not that it is *right*. Before
committing a machine-generated language, spot-check a stratified sample —
short and long verses, and every commentator if commentary is involved.

Two checks worth running because they are cheap and catch real defects:

- **Cross-script agreement.** For two languages whose scripts derive from the
  same parent, a shared Sanskrit term should be the same word in both, differing
  only in glyph. Kannada and Telugu satisfy `telugu = kannada - 0x80` exactly:
  verified across all 65,838 characters of `text_kannada`/`text_telugu` with zero
  exceptions. So a Sanskrit term that isn't an exact codepoint-offset twin
  between those two outputs is a bug you can find without reading the text.
- **Back-translation.** Translate the generated text back to English with a
  local model and diff against the source. It catches omissions, padding and
  hallucinated clauses — the defects a script-purity check is blind to.

## 7. Commit

Conventional Commits, matching the existing log — `feat(data): …` for corpus
changes, `feat(i18n): …` or `feat(reader): …` for UI. Keep the data change and
the UI change in separate commits; they get reviewed differently and reverted
independently.

State the provenance in the commit body, the same way `translation_kannada`'s
history does. Someone will ask in a year where the text came from, and the
commit is the first place they look.

## References

- `references/translation-quality.md` — the quality bar for generated text, the
  measured failure modes of IndicTrans2 and smaller models, and which registers
  need a strong model.
- `references/code-touchpoints.md` — file-by-file list of what a new language
  changes in the app.
