---
name: update-language
description: Find and fill gaps in a language the corpus already carries, or replace existing text with something better. Starts by scanning coverage so you know what is actually missing before deciding anything. Use this skill for any request about incomplete or improvable per-language data — "why is context_kannada empty for most verses", "translate the commentary into Telugu", "what's missing for Kannada", "backfill the word meanings", "replace the machine-assisted Kannada with a real translation", "how complete is the corpus" — and whenever a field exists for some verses but not others. For adding a language the corpus does not have yet, use onboard-language instead; for the text production itself, this skill hands off to translator.
---

# Filling in a language the corpus already has

The corpus is 701 verses. Every language is a set of parallel fields across all
of them, so "Kannada is done" is never true as a whole — only per field.

**This skill needs no type, UI or font changes.** That is the line between it and
`onboard-language`. If you find yourself editing `Language` in `gita.types.ts` or
adding an `@font-face`, you are in the wrong skill.

## 1. Scan first

```bash
node scripts/data-sources/coverage.mjs            # every field
node scripts/data-sources/coverage.mjs --gaps     # only incomplete ones
node scripts/data-sources/coverage.mjs --lang kn
node scripts/data-sources/coverage.mjs --field context_kannada --ids
```

- Reads `src/data/verses.json` directly, so it reflects the working tree.
  `manifest.json` has the same counts but only after a build.
- `--ids` prints the missing verse ids. Feed them to a translation run with
  `--only`.

**A partly-filled field has two possible causes. Work out which:**

- It was never finished.
- A merge silently dropped rows.

## 2. Check what the existing entries actually contain

The field name is not a contract. Open a few entries before matching them.

The live example — one field name, three different kinds of content:

| field | entries | what is actually in it |
|---|---|---|
| `context_english` | 701 | word-by-word glosses |
| `context_kannada` | 4 | one-line prose summaries |
| `context_telugu` | 22 | long multi-commentator bhāṣya notes |

So filling `context_kannada` means **choosing** which of these is correct and
saying so — not blindly matching what is already there.

## 3. Decide whether the gap is worth filling

- A wrong gloss is worse than an English fallback. The reader can see that
  English is English; they cannot see that a Kannada gloss is wrong.
- `translation_telugu_machine` exists for exactly this reason — it marks three
  composed verses as composed rather than passing them off as Wikisource text.

Weigh the volume too:

| field | source size | notes |
|---|---|---|
| `context_english` (glosses) | 192k chars | smaller, higher value per verse |
| `commentary_english` | 655k chars | 3.4× larger |

Commentary is not uniform. Split it by `commentary_author`:

- 631 verses of plain Sivananda prose — easier, lower risk.
- 70 verses of Śaṅkara and Rāmānuja bhāṣya — hard, and where quality usually
  fails. Treat these separately.

## 4. Produce the text

Use the **translator** skill. It covers all three routes and the evidence for
choosing between them.

Short version:

- Glosses and bhāṣya → path 1 (human source) or path 2 (online model).
- Plain prose → path 3 (local IndicTrans2) is acceptable.

**If the target field does not exist on any verse yet, check for plumbing.**
`commentary_kannada` and `commentary_telugu` are the live case: commentary is
English-only by design and ships as separate `commentary-NN.json` files, so a
translated commentary also needs

- a new key in `COMMENTARY_KEYS` (`scripts/build-data.mjs:39`), and
- a merge in `src/lib/gita.ts:112-123`.

The full map is at
`.claude/skills/onboard-language/references/code-touchpoints.md`.

## 5. Merge and verify

The translator skill covers the merge command and the pipeline. One thing to add
here — **re-run the coverage scan afterwards**:

```bash
node scripts/data-sources/coverage.mjs --field <target_field>
```

This is the only check that answers the question you started with. If the count
is lower than expected, the merge dropped rows — `--allow-partial` permits that
silently, which is right for a deliberate backfill and wrong otherwise.

Then spot-check a stratified sample by hand. Automated checks prove the data is
well-formed, never that it is correct.

## 6. Commit

- Use `feat(data): …`, matching the existing log.
- State in the body which route produced the text.
- For a licensed source, name the licence and the attribution.
- Keep data commits separate from UI commits so they revert independently.
