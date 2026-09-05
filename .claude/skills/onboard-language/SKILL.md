---
name: onboard-language
description: Add a language the corpus does not carry yet — the licence decision, then the type, UI, search, build and font changes that make the reader able to show it. Use this skill for "add Hindi", "onboard Tamil", "can we support Marathi", "what would it take to add a fourth language", or any request that would widen the Language union in gita.types.ts. It covers the app-side work specifically; the text itself comes from the translator skill, and filling gaps in a language already present belongs to update-language. Reach for it before writing any code, because the licence decision constrains everything after it and is expensive to revisit once text is in the corpus.
---

# Adding a language the corpus does not have

Two things make this different from filling in an existing language. The licence
decision has to be made first and is effectively irreversible once text is
merged. And the app has to learn the language exists — roughly thirty
touchpoints across types, UI, search, the build and the fonts.

The text production itself is not special: once you have decided where the text
comes from, hand off to the **translator** skill, which covers all three routes
and the merge.

## 1. Decide the licence question first

Do this before any code, and before generating anything. Use **translator**
path 1 — it has the search strategy and the licence rules — and come back with
one of two answers, written down:

- **A cleanly-licensed source exists**, with its licence named and attribution
  recorded.
- **No usable source exists**, so the text will be generated. This is a
  legitimate outcome and is what Kannada did, but it has to be recorded, carried
  on every verse in a `_source` field, and surfaced to the reader.

Append the finding to `scripts/data-sources/README.md` as a new section. That
file is the project's record of why each language's text is what it is, and the
reasoning already there is the standard to meet.

For Hindi specifically, `TODO.md:100` already contains this research: the open
JSON datasets all carry in-copyright translations, hi.wikisource's scan is
unproofread, and the one public-domain human translation is Gandhi's
अनासक्तियोग (1930) at ~75-85% OCR. Read it rather than repeating the search.

## 2. Get the text

Hand off to the **translator** skill. Output is a JSON object keyed
`"chapter.verse"`, and the merge is `merge-language.mjs` — both covered there.

One thing specific to a *new* language: if its script is not in the `SCRIPTS`
table in `scripts/data-sources/merge-language.mjs`, add the Unicode block. One
row, and every later language benefits.

Do not merge yet if you can avoid it. Widening the types first (step 3) means
the compiler tells you what else to change while the data is still absent, which
is a cheaper order than discovering it after `verses.json` has grown.

## 3. Teach the app the language exists

`references/code-touchpoints.md` is the file-by-file map. Three things about the
order of work:

**Start at `Language` in `src/lib/gita.types.ts:2`.** Widening that union turns
most of the remaining work into compiler errors, because the per-language string
tables are `Record<Language, …>` and stop compiling until each gains a key. Let
the type checker enumerate the list instead of hunting by hand.

**Two places need thought, not another case.** `pick()` in
`VerseViewer.tsx:32-38` takes *positional* per-language arguments — a fourth
language wants it rewritten against the `SUFFIX` table at `src/lib/gita.ts:37`.
And the search row is a positional tuple whose offsets are declared in both
`src/lib/search.ts:8` and `scripts/build-data.mjs:191-196`; they must agree, so
**append** the new column rather than inserting one.

**`chapters.json` is separate from the verse fields** — `name_*`,
`name_meaning_*`, `summary_*`. Forgetting it shows up as a blank home screen,
not a build error.

## 4. Fonts — check whether you need one at all

`src/index.css:2404` already maps `[lang="hi"]` to the Devanagari face, so
**Hindi needs no new font**. Any language written in a script the corpus already
renders is in the same position.

If the script genuinely is new, `scripts/subset-fonts.mjs` builds the subset and
prints the `@font-face` block to paste into `src/index.css`. The faces are
subsetted to exactly the codepoints the corpus uses, which is why **it must run
after the merge and after the UI strings are written** — it derives the subset by
scanning `src/data/*.json`, `src/**/*.tsx?` and `index.html`, so running it early
produces a font missing precisely the glyphs the new strings need.

Both weights (400 and 600) are needed; semibold Indic appears in `.verse-tab`,
`.chapter-badge`, `.chapter-stats` and `.verse-of-moment-label`.

## 5. Run the pipeline and check the budget

The translator skill covers `fix-corpus` → `check-corpus` → `build-data`. Two
things a new language adds on top:

- `scripts/check-size.mjs:63` — `chapters.json` is statically imported, so its
  new fields count against the **`js`** budget, not a data budget. Expect to
  raise it, and leave a comment saying why in the style of lines 43-49.
- `vite.config.ts:116` — `globIgnores` keeps the large Indic faces out of the
  Workbox precache. Add the new one, and note the `-600` variants are currently
  *not* excluded, so make that call deliberately rather than by omission.

Then confirm the coverage is what you expect:

```
node scripts/data-sources/coverage.mjs --lang <tag>
```

## 6. Update the prose that names the languages

Easy to forget and all reader- or agent-visible: `src/App.tsx:297` (the
reading-face footer names Kannada and Telugu), `index.html:25` meta description,
`public/llms.txt`, `README.md:8`, and the font tables in `docs/`.

## 7. Commit

Keep the data commit and the UI commit separate — they get reviewed differently
and reverted independently. `feat(data): …` and `feat(i18n): …` match the
existing log. State the provenance and the licence in the body.

## References

- `references/code-touchpoints.md` — the file-by-file map, with line numbers.
- The **translator** skill — text production, merge, and the quality evidence in
  its `references/translation-quality.md`.
- The **update-language** skill — for filling gaps once the language is in.
