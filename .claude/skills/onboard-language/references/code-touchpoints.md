# Code touchpoints for a new language

Every place a new language changes the app. Surveyed against the current
three-language state (`en` / `kn` / `te`).

**Line numbers drift.** Treat them as a starting point and confirm before editing.

**Do these in order:** types → the errors that surfaces → search → build → fonts.
Widening `Language` first makes the compiler list most of the work for you.

- [1. Types](#1-types)
- [2. Field lookup and UI tables](#2-field-lookup-and-ui-tables)
- [3. Search](#3-search)
- [4. Build pipeline](#4-build-pipeline)
- [5. Corpus checks](#5-corpus-checks)
- [6. Fonts](#6-fonts)
- [7. Output and caching](#7-output-and-caching)
- [8. Prose that names the languages](#8-prose-that-names-the-languages)

## 1. Types

All in `src/lib/gita.types.ts`.

| line | what to add |
|---|---|
| 2 | `Language = "en" \| "kn" \| "te"` — **start here** |
| 8-9 | `text_<lang>` — the verse in the new script |
| 12-13 | `translation_<lang>` |
| 16 | `translation_telugu_machine?` — decide if the new language needs its own per-verse flag |
| 18-19 | `context_<lang>` — word glosses |
| 42-43 | `ChapterMeta.name_<lang>` |
| 45-46 | `ChapterMeta.name_meaning_<lang>` |
| 49-50 | `ChapterMeta.summary_<lang>` |

## 2. Field lookup and UI tables

### The central lookup

`src/lib/gita.ts:37`

```ts
const SUFFIX: Record<Language, "" | "_kannada" | "_telugu"> = { … };
```

Add the tag → suffix mapping and widen the union type. `chapterText()` at 41-45
then works generically.

### Needs a rewrite, not another case

`src/components/VerseViewer.tsx`

| line | problem |
|---|---|
| 32-38 | `pick()` takes **positional** `kannada`/`telugu` arguments. Rewrite it against the `SUFFIX` table rather than adding a fourth parameter. |
| 108-110 | Three `pick()` call sites to update with it. |
| 30 | `Tagged.lang` is a literal union — widen. |
| 53, 116 | Special-cases `language === "te" && translation_telugu_machine`. Generalise if the new language ships machine translations. |

### Other hard-coded `kn` / `te` branches

| file:line | what |
|---|---|
| `src/components/VerseOfMoment.tsx:22-32` | `scriptureOf()` and `translationOf()` |
| `src/components/SavedScreen.tsx:15-19` | `scriptureOf()` reads search-index offsets 3/4 — needs the new offset (see §3) |
| `src/lib/router.tsx:176-183` | `?lang=` override checks literals; better to validate against `LANGUAGES` |

### Extends automatically once the arrays grow

| file:line | what |
|---|---|
| `src/lib/settings.tsx:99` | `LANGUAGES` — switcher order |
| `src/lib/settings.tsx:101` | `LANGUAGE_LABELS` — use the endonym |
| `src/App.tsx:282-286` | Settings radio group |
| `src/components/TabBar.tsx:107-113` | Language pills — sized from `LANGUAGES.length` |
| `src/desktop.css:584-640` | Pill geometry via `--slots`. **Check a 4-slot pill still fits.** |

### String tables — each needs one more key or the build fails

All are `Record<Language, …>`.

| file:line | table |
|---|---|
| `src/App.tsx:31` | `APP_NAME` |
| `src/components/SearchScreen.tsx:12` | `SEARCH_PLACEHOLDER` |
| `src/components/VerseOfMoment.tsx:34` | `LABEL` |
| `src/components/VerseOfMoment.tsx:35` | `SECTION_LANG` |
| `src/components/VerseViewer.tsx:59` | `COMMENTARY_LABEL` |
| `src/components/VerseViewer.tsx:61` | `SECTION_LANG` |
| `src/components/VerseViewer.tsx:46-49` | `TRANSLATION_SOURCE` — `Partial`, so optional, but fill it |
| `src/components/ChapterList.tsx:16-20` | `CHAPTER_LABEL` |
| `src/components/ChapterList.tsx:22-26` | `VERSES_LABEL` |

## 3. Search

The search row is a **positional tuple**, and its offsets are declared in two
files that must agree. Change one without the other and snippets are attributed
to the wrong language, with no error.

| file:line | what |
|---|---|
| `src/lib/search.ts:8` | `Row = [ch, v, deva, kn, te, translit, en]` |
| `src/lib/search.ts:16` | `snippetLang` union |
| `src/lib/search.ts:41-42` | `normalizeRow` builds exactly `row[2]..row[6]` |
| `src/lib/search.ts:112-116` | `FIELDS` — offset, language and weight per column |
| `scripts/build-data.mjs:191-196` | The row builder. **Must match the above exactly.** |
| `src/components/CommandPalette.tsx:76` | Haystack of chapter names — add the new `name_*` fields or the chapter cannot be found by its own name |

**Append the new column at the end.** Inserting one renumbers every offset after
it, including the ones `SavedScreen.tsx` hard-codes.

## 4. Build pipeline

`scripts/build-data.mjs`

| line | what |
|---|---|
| 14-30 | `VERSE_KEYS` — keys not listed here are silently dropped |
| 41 | `SOURCE_KEYS` — add `translation_<lang>_source`, or `validate()` flags it as unknown |
| 43-55 | `CHAPTER_KEYS` |
| 82-84 | Script-block regexes — add the new script |
| 101-108 | Script-integrity table — add `["text_<lang>", RE, "Name"]` |
| 191-196 | Search-index row builder (see §3) |
| 217-218 | Coverage map — derived from `VERSE_KEYS`, extends automatically |
| 231-233 | Prunes any file not in `expected` — register new per-language outputs |

`scripts/check-size.mjs:63` — `BUDGETS = { js, css, desktopCss }`.

- `src/data/chapters.json` is **statically imported**, so its new fields count
  against the **`js`** budget, not a data budget.
- Expect to raise it. Leave a comment saying why, in the style of lines 43-49.

## 5. Corpus checks

`scripts/data-sources/check-corpus.mjs` is the most language-aware file.

| line | what |
|---|---|
| 31-35 | `BLOCK` regex map — add the new script |
| 54-59 | `FIELDS` structural list |
| 82-86 | Script-integrity pairs |
| 122 | Native-digit check (`[೦-೯]`, `[౦-౯]`, `[०-९]`) |
| 135 | Normalisation loop |
| 146-147 | Avagraha presence |
| 168-172 | Speaker formula / `uvāca` presence |
| 176 | Blob-repetition field list |
| **239** | **BLOCKER class list — add the new field's `E-missing:` class, or a missing field never fails the build** |

Lines 216-230 and 256 are Kannada-specific term-drift analysis. Leave them
language-specific unless the new language needs an equivalent.

`fix-corpus.mjs` repairs English OCR only. No change unless the new source
brings its own defects.

## 6. Fonts

**Check whether you need a new face at all.** `src/index.css:2404` already maps
`[lang="hi"]` to the Devanagari face, so **Hindi needs no new font** — only data
and UI work. The same applies to any language in a script already rendered.

If the script is genuinely new:

| file:line | what |
|---|---|
| `scripts/subset-fonts.mjs:21-37` | Add to `FACES`: `{ file: "noto-sans-<script>", family: "Noto Sans <Script>", blocks: [...] }`. Mirror Google's original `unicode-range` so dandas and vedic marks stay on the right face. |
| `scripts/subset-fonts.mjs:38` | `WEIGHTS = [400, 600]` — both needed; semibold Indic appears in `.verse-tab`, `.chapter-badge`, `.chapter-stats`, `.verse-of-moment-label` |
| `scripts/subset-fonts.mjs:47-60` | Scans `src/data/*.json`, `src/**/*.tsx?`, `index.html`. **Run it after the merge and after UI strings are written**, or the subset omits the new glyphs. |
| `scripts/subset-fonts.mjs:96-119` | Fetches from Google, writes `public/fonts/<name>.woff2`, prints the `@font-face` block. No CLI args; rewrites all faces each run. |
| `src/index.css:80-127` | Paste the two new `@font-face` blocks here |
| `src/index.css:153-155` | Add `--font-<script>` with platform fallbacks ("… Sangam MN", "Nirmala UI") |
| `src/index.css:2403-2415` | Add a `[lang="<tag>"]` rule setting `font-family` and `--lh-indic`. Keep it last in the file — lines 2401-2402 explain why these are attribute selectors, not `:lang()`. |
| `src/desktop.css:318-326` | Add the tag to the `font-feature-settings` / `font-variant-ligatures` rule for display sizes |

## 7. Output and caching

| file | effect |
|---|---|
| `public/data/v1/chapter-NN.json` | All 18 files gain the new keys |
| `public/data/v1/search-index.json` | Row width grows. ~726 KB today, deliberately under the 500 KB precache limit at `vite.config.ts:123`. **Confirm it is still not precached.** |
| `public/data/v1/manifest.json` | `sources` and `coverage` gain entries. Every chapter's `bytes`/`sha` changes, invalidating all Workbox precache revisions on next deploy — expected. |
| `vite.config.ts:116` | `globIgnores` excludes the large Kannada and Telugu faces from precache. Add the new one. Note the `-600` variants are **not** currently excluded, so decide that deliberately. |

`public/data/v1/commentary-NN.json` is English-only (`COMMENTARY_KEYS`,
`build-data.mjs:39`). Per-language commentary needs a new key there **and** a
merge in `src/lib/gita.ts:112-123`.

## 8. Prose that names the languages

All reader- or agent-visible:

| file:line | what |
|---|---|
| `src/App.tsx:297` | Reading-face footer: "Kannada and Telugu keep Noto Sans" |
| `index.html:25` | Meta description |
| `public/llms.txt:4,22,26,32` | Corpus description and per-field coverage |
| `README.md:8` | "Switch between English, Kannada, and Telugu" |
| `docs/ARCHITECTURE_PLAN.md`, `docs/DESIGN_PLAN.md` | Font and unicode-range tables |
| `src/index.css:136-138` | Comment naming only Kannada and Telugu |

**Read `TODO.md:100` first** — it already contains the licence research for
Hindi, and names `Language` in `gita.types.ts` plus `LANGUAGES` /
`LANGUAGE_LABELS` in `settings.tsx` as the decision gate.
(`TODO.md:99` is the related `context_kannada` / `context_telugu` coverage gap.)

## Confirmed not per-language

No changes needed in: `src/lib/sw.ts`, `bookmarks.ts`, `history.ts`, `keys.ts`,
`media.ts`, `ShortcutsSheet.tsx`, `Header.tsx`, `wrangler.toml`, the PWA manifest
at `vite.config.ts:72-101`, and `<html lang="en">` at `index.html:2`.
