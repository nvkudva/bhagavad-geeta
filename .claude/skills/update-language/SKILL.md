---
name: update-language
description: Find and fill gaps in a language the corpus already carries, or replace existing text with something better. Starts by scanning coverage so you know what is actually missing before deciding anything. Use this skill for any request about incomplete or improvable per-language data — "why is context_kannada empty for most verses", "translate the commentary into Telugu", "what's missing for Kannada", "backfill the word meanings", "replace the machine-assisted Kannada with a real translation", "how complete is the corpus" — and whenever a field exists for some verses but not others. For adding a language the corpus does not have yet, use onboard-language instead; for the text production itself, this skill hands off to translator.
---

# Filling in a language the corpus already has

The corpus is 701 verses and every language is a set of parallel fields across
all of them. "Kannada is done" is never true as a whole — it is true per field.
So the work always starts by finding out what is actually missing, and ends by
proving the merge did what you meant.

Adding fields to an existing language needs **no type, UI or font changes** —
that is what makes this different from onboarding a new one. If you find
yourself editing `Language` or `@font-face`, you are in `onboard-language`
territory.

## 1. Scan before deciding

```
node scripts/data-sources/coverage.mjs            # every field
node scripts/data-sources/coverage.mjs --gaps     # only incomplete ones
node scripts/data-sources/coverage.mjs --lang kn
node scripts/data-sources/coverage.mjs --field context_kannada --ids
```

This reads `src/data/verses.json` directly, so it is true of the working tree —
`manifest.json` carries the same counts but only after a build.

**Read the partial fields carefully.** A field present on some verses and absent
on others is the interesting case, and it has two very different causes: either
it was never finished, or a merge silently dropped rows. `--ids` prints the
missing verse ids, which is also what you feed a translation run via `--only`.

**Check what the existing entries actually contain before matching them.** The
field name is not a contract. `context_english` is word-by-word glosses, but the
four `context_kannada` entries are one-line prose summaries and the twenty-two
`context_telugu` entries are long multi-commentator bhāṣya notes — three genres
sharing one field name. Filling such a field means choosing which genre is
correct and saying so, not blindly matching whatever is there.

## 2. Decide what the gap is worth

Not every gap should be filled the same way, and some should be left alone.

Weigh the reader's experience against the honesty of the fill. A word-by-word
gloss that is mechanically wrong is worse than an English fallback the reader
can see is English, because the reader cannot tell the wrong one is wrong.
`translation_telugu_machine` exists precisely so three composed verses could be
shown as composed rather than passed off as the Wikisource text.

Also weigh volume. Commentary is 655k characters — roughly 3.4× the word
glosses — and the registers inside it are not uniform: 631 verses of plain
Sivananda prose, and 70 of Śaṅkara and Rāmānuja bhāṣya that are far harder and
carry most of the risk. Splitting by `commentary_author` and treating those 70
separately is usually the right call.

## 3. Produce the text

Use the **translator** skill. It covers the three routes — find a licensed human
translation, generate with an online model, generate locally with IndicTrans2 —
and the quality evidence for choosing between them.

The short version: glosses and bhāṣya need path 1 or 2; plain prose can take
path 3. All three produce the same `{"chapter.verse": "…"}` shape.

If the target field does not exist yet on any verse, check whether it needs
plumbing beyond the data. `commentary_kannada` and `commentary_telugu` are the
live example: commentary is English-only by design and ships as separate
`commentary-NN.json` files, so a translated commentary also needs new keys in
`COMMENTARY_KEYS` (`scripts/build-data.mjs:39`) and a merge in
`src/lib/gita.ts:112-123`. `onboard-language`'s `references/code-touchpoints.md`
has the map.

## 4. Merge, verify, and prove it landed

The translator skill covers the merge invocation and the pipeline. The one thing
worth repeating here: **re-run the coverage scan afterwards**, because it is the
only check that answers the question you actually started with.

```
node scripts/data-sources/coverage.mjs --field <target_field>
```

If the count is not what you expected, the merge dropped rows — `--allow-partial`
silently permits that, which is what you want for a deliberate backfill and not
what you want otherwise.

Before accepting generated text, spot-check a stratified sample: short and long
verses, and every commentator if commentary is involved. Mechanical checks prove
well-formedness, never correctness.

## 5. Commit

`feat(data): …`, matching the existing log. State the provenance in the body —
which route produced the text, and for a licensed source, the licence and
attribution. Someone will ask in a year where it came from and the commit is
where they will look.

Keep data commits separate from any UI change, so they revert independently.
