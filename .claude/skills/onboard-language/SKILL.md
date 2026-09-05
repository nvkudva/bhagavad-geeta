---
name: onboard-language
description: Add a language the corpus does not carry yet — the licence decision, then the type, UI, search, build and font changes that make the reader able to show it. Use this skill for "add Hindi", "onboard Tamil", "can we support Marathi", "what would it take to add a fourth language", or any request that would widen the Language union in gita.types.ts. It covers the app-side work specifically; the text itself comes from the translator skill, and filling gaps in a language already present belongs to update-language. Reach for it before writing any code, because the licence decision constrains everything after it and is expensive to revisit once text is in the corpus.
---

# Adding a language the corpus does not have

Two things make this different from filling in an existing language:

- The licence decision comes first and is effectively irreversible once text is
  merged.
- The app has to learn the language exists — about thirty touchpoints across
  types, UI, search, the build and the fonts.

The text production itself is not special. Once you know where the text comes
from, hand off to the **translator** skill.

## Step order

Do these in order. Each one makes the next cheaper.

1. Decide the licence.
2. Widen the types.
3. Fix everything the compiler now flags.
4. Get and merge the text.
5. Fonts.
6. Build and budget.
7. Prose and docs.
8. Commit.

Types before text is deliberate: the compiler will list most of the work for you
while `verses.json` is still small.

## 1. Decide the licence

Use **translator** path 1. Come back with one of two written answers:

- **A licensed source exists** — name the licence and the attribution.
- **No usable source exists** — so the text will be generated. This is a
  legitimate outcome and is what Kannada did. It must be recorded, carried on
  every verse in a `_source` field, and shown to the reader.

Then append the finding to `scripts/data-sources/README.md` as a new section.

**For Hindi, this is already done.** `TODO.md:100` records it: the open JSON
datasets all carry in-copyright translations, hi.wikisource's scan is
unproofread, and the only public-domain human translation is Gandhi's
अनासक्तियोग (1930) at ~75-85% OCR. Read it instead of repeating the search.

## 2. Widen the types

Start at `src/lib/gita.types.ts:2`:

```ts
export type Language = "en" | "kn" | "te";   // add the new tag here
```

Everything per-language is a `Record<Language, …>`, so widening this union turns
the rest of the work into compiler errors. Let the type checker list them.

Then add the optional fields on `Verse` and `ChapterMeta` — see
`references/code-touchpoints.md` §1.

## 3. Fix what the compiler flags

Most are string tables that just need one more key. Two need actual thought:

- **`pick()` in `VerseViewer.tsx:32-38`** takes *positional* per-language
  arguments. A fourth language means rewriting it against the `SUFFIX` table at
  `src/lib/gita.ts:37`, not adding another parameter.
- **The search row is a positional tuple**, declared in two files that must
  agree: `src/lib/search.ts:8` and `scripts/build-data.mjs:191-196`.
  **Append** the new column — inserting one renumbers every offset after it.

One thing the compiler will *not* catch:

- **`chapters.json`** needs `name_*`, `name_meaning_*` and `summary_*`. Missing
  them gives a blank home screen, not a build error.

Full map: `references/code-touchpoints.md`.

## 4. Get and merge the text

Use the **translator** skill for both.

One detail specific to a new language: if its script is missing from the
`SCRIPTS` table in `scripts/data-sources/merge-language.mjs`, add its Unicode
block. One row, and every later language benefits.

## 5. Fonts

**First check whether you need one at all.** `src/index.css:2404` already maps
`[lang="hi"]` to the Devanagari face, so **Hindi needs no new font**. Any
language in a script the corpus already renders is in the same position.

If the script is genuinely new:

```bash
node scripts/subset-fonts.mjs
```

- It builds the subset and prints the `@font-face` block to paste into
  `src/index.css`.
- **Run it after the merge and after the UI strings are written.** It derives
  the subset by scanning `src/data/*.json`, `src/**/*.tsx?` and `index.html`, so
  running it early produces a font missing exactly the new glyphs.
- Both weights (400 and 600) are needed — semibold Indic appears in
  `.verse-tab`, `.chapter-badge`, `.chapter-stats` and `.verse-of-moment-label`.

See `references/code-touchpoints.md` §6 for the CSS declarations to add.

## 6. Build and check the budget

Run the pipeline from the **translator** skill, then handle two things a new
language adds:

- **`scripts/check-size.mjs:63`** — `chapters.json` is statically imported, so
  its new fields count against the **`js`** budget, not a data budget. Expect to
  raise it, and leave a comment saying why (see lines 43-49 for the style).
- **`vite.config.ts:116`** — `globIgnores` keeps the large Indic fonts out of the
  Workbox precache. Add the new face. Note the `-600` variants are currently
  *not* excluded, so decide that deliberately rather than by omission.

Then confirm coverage:

```bash
node scripts/data-sources/coverage.mjs --lang <tag>
```

## 7. Update the prose that names the languages

All reader- or agent-visible, and easy to miss:

- `src/App.tsx:297` — the reading-face footer names Kannada and Telugu.
- `index.html:25` — meta description.
- `public/llms.txt`
- `README.md:8`
- The font tables in `docs/ARCHITECTURE_PLAN.md` and `docs/DESIGN_PLAN.md`.

## 8. Commit

- Keep the data commit and the UI commit separate — they are reviewed
  differently and revert independently.
- `feat(data): …` and `feat(i18n): …` match the existing log.
- State the provenance and the licence in the body.

## References

- `references/code-touchpoints.md` — the file-by-file map with line numbers.
- **translator** skill — text production, merging, and quality evidence.
- **update-language** skill — for filling gaps once the language is in.
