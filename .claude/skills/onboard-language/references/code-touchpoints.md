# Code touchpoints for a new language

Surveyed against the three-language state (`en`/`kn`/`te`). Line numbers drift —
treat them as a starting point and confirm before editing.

Order matters: do **types → data pipeline → UI tables → fonts**. Starting at
`Language` makes the compiler enumerate most of the remaining work for you,
because every `Record<Language, …>` table becomes a type error until filled.

- [1. Types](#1-types)
- [2. Field lookup and UI tables](#2-field-lookup-and-ui-tables)
- [3. Search](#3-search)
- [4. Build pipeline](#4-build-pipeline)
- [5. Corpus checks](#5-corpus-checks)
- [6. Fonts](#6-fonts)
- [7. Output and caching](#7-output-and-caching)
- [8. Prose that names the languages](#8-prose-that-names-the-languages)

## 1. Types

`src/lib/gita.types.ts`

| line | what |
|---|---|
| 2 | `Language = "en" \| "kn" \| "te"` — **start here** |
| 8-9 | `text_kannada` / `text_telugu` → add `text_<lang>` |
| 12-13 | `translation_*` → add `translation_<lang>` |
| 16 | `translation_telugu_machine?` — decide if the new language needs a per-verse machine flag |
| 18-19 | `context_*` (word glosses) |
| 42-50 | `ChapterMeta`: `name_*`, `name_meaning_*`, `summary_*` |

## 2. Field lookup and UI tables

The single most important one:

- `src/lib/gita.ts:37` — `SUFFIX: Record<Language, "" | "_kannada" | "_telugu">`.
  Add the tag → suffix mapping and widen the union. `chapterText()` (41-45)
  then works generically.

**`VerseViewer` needs a small refactor, not just an added case.**
`src/components/VerseViewer.tsx:32-38` — `pick()` takes *positional*
`kannada`/`telugu` arguments, with three call sites at 108-110. A fourth
language means either another positional parameter or, better, rewriting it to
use the `SUFFIX` lookup. Also `Tagged.lang` (line 30) is a literal union, and
lines 53/116 special-case `language === "te" && translation_telugu_machine` —
generalise that if the new language ships machine translations.

Other hard-coded `kn`/`te` branches:

- `src/components/VerseOfMoment.tsx:22-32` — `scriptureOf()` / `translationOf()`
- `src/components/SavedScreen.tsx:15-19` — `scriptureOf()` reads search-index row
  offsets 3/4; needs the new offset (see §3)
- `src/lib/router.tsx:176-183` — `?lang=` override checks literals; prefer
  validating against `LANGUAGES`

Switcher and settings (these extend automatically once the arrays grow):

- `src/lib/settings.tsx:99` `LANGUAGES`, `:101` `LANGUAGE_LABELS` (use the endonym)
- `src/components/TabBar.tsx:107-113` + `src/desktop.css:584-640` — pill geometry
  is driven by `--slots` from `LANGUAGES.length`; **check a 4-slot pill still fits**
- `src/App.tsx:282-286` — settings radio group, auto-extends

`Record<Language, …>` string tables — each must gain a key or the build fails:

`src/App.tsx:31` `APP_NAME` · `SearchScreen.tsx:12` `SEARCH_PLACEHOLDER` ·
`VerseOfMoment.tsx:34-35` `LABEL`, `SECTION_LANG` · `VerseViewer.tsx:59,61`
`COMMENTARY_LABEL`, `SECTION_LANG` · `ChapterList.tsx:16-26` `CHAPTER_LABEL`,
`VERSES_LABEL` · `VerseViewer.tsx:46-49` `TRANSLATION_SOURCE` (Partial, but fill it)

## 3. Search

The row is a positional tuple, and **its offsets are defined in two files that
must agree**. Changing one without the other silently mis-attributes snippets.

- `src/lib/search.ts:8` — `Row` = `[ch, v, deva, kn, te, translit, en]`; inserting
  a column renumbers everything after it
- `src/lib/search.ts:16` `snippetLang` union; `:112-116` `FIELDS` offset/lang/weight
  table; `:41-42` `normalizeRow` builds exactly `row[2]..row[6]`
- `scripts/build-data.mjs:191-196` — the row builder; **must match the above exactly**
- `src/components/CommandPalette.tsx:76` — haystack concatenates `name_kannada`,
  `name_telugu`, `name_meaning_*`; add the new chapter-name fields or the chapter
  is unfindable by its own name

Safer than inserting: **append** the new column at the end, leaving existing
offsets untouched.

## 4. Build pipeline

`scripts/build-data.mjs`

| line | what |
|---|---|
| 14-30 | `VERSE_KEYS` — omitted keys are silently dropped by `pick()` |
| 41 | `SOURCE_KEYS` — add `translation_<lang>_source` or `validate()` flags it as unknown |
| 43-55 | `CHAPTER_KEYS` |
| 82-84 | script-block regexes |
| 101-108 | script-integrity table — add `["text_<lang>", RE, "Name"]` |
| 191-196 | search-index row builder (see §3) |
| 231-233 | prunes any file not in `expected` — register new per-language outputs |

`scripts/check-size.mjs:63` — `BUDGETS = { js, css, desktopCss }`. A fourth
language grows `src/data/chapters.json`, which is **statically imported** and so
counts against the `js` row. Raise it and add a comment in the style of lines 43-49.

## 5. Corpus checks

`scripts/data-sources/check-corpus.mjs` — the most per-language-aware file:

`:31-35` `BLOCK` regex map · `:54-59` `FIELDS` structural list · `:82-86`
script-integrity pairs · `:122` native-digit check (`[೦-೯]`, `[౦-౯]`, `[०-९]`) ·
`:135` normalisation loop · `:146-147` avagraha presence · `:168-172` speaker
formula / `uvāca` · `:176` blob-repetition fields · `:239` **BLOCKER class list —
add the new field's `E-missing:` class or absence never fails the build**

`:216-230` and `:256` are Kannada-specific term-drift analysis; leave
language-specific unless the new language needs an equivalent.

`fix-corpus.mjs` is English OCR repair only — no change unless the new source
brings its own defects.

## 6. Fonts

**Check first whether a new face is needed at all.** `src/index.css:2403-2415`
already maps `[lang="hi"]` to the Devanagari face, so **Hindi needs no new
font** — only data and UI work.

If the script genuinely is new:

- `scripts/subset-fonts.mjs:21-37` — add to `FACES`:
  `{ file: "noto-sans-<script>", family: "Noto Sans <Script>", blocks: [...] }`.
  Mirror Google's original `unicode-range` for that face so dandas and vedic
  marks stay with the right one.
- `:38` `WEIGHTS = [400, 600]` — both are needed (semibold Indic labels appear in
  `.verse-tab`, `.chapter-badge`, `.chapter-stats`, `.verse-of-moment-label`)
- `:47-60` — the corpus scan walks `src/data/*.json`, `src/**/*.tsx?` and
  `index.html`, so it picks up new verse fields and UI strings automatically.
  **Run it after the merge and after the UI tables are written**, or the subset
  omits exactly the glyphs the new strings need.
- `:96-119` — fetches from Google, writes `public/fonts/<name>.woff2`, prints the
  `@font-face` block to paste. No CLI args; it rewrites every face each run.
- `src/index.css:80-127` — paste the two new `@font-face` blocks here
- `src/index.css:153-155` — add `--font-<script>` with platform fallbacks
  ("… Sangam MN", "Nirmala UI")
- `src/index.css:2403-2415` — add the `[lang="<tag>"]` rule setting `font-family`
  and `--lh-indic`. Keep it in the same last-in-file position; line 2401-2402
  records why these are attribute selectors and not `:lang()`.
- `src/desktop.css:318-326` — add the tag to the `font-feature-settings`
  / `font-variant-ligatures` rule for display sizes

## 7. Output and caching

- `public/data/v1/chapter-NN.json` — all 18 gain the new keys
- `public/data/v1/search-index.json` — row width grows; ~726 KB today and
  deliberately under the 500 KB precache trip-wire at
  `vite.config.ts:123` (`maximumFileSizeToCacheInBytes`). **Confirm it is still
  not precached** after widening.
- `public/data/v1/manifest.json` — `sources` and `coverage` gain entries; every
  chapter's `bytes`/`sha` changes, invalidating all Workbox precache revisions
  on the next deploy (expected, worth knowing)
- `vite.config.ts:116` — `globIgnores` excludes `noto-sans-kannada.woff2` and
  `noto-sans-telugu.woff2` from precache. Add the new face. Note the `-600`
  variants are **not** currently excluded, so they are precached today; make the
  same call deliberately for the new one.
- `public/data/v1/commentary-NN.json` is English-only (`COMMENTARY_KEYS`,
  `build-data.mjs:39`). Per-language commentary needs a new key here *and* a
  merge in `src/lib/gita.ts:112-123`.

## 8. Prose that names the languages

Easy to forget, all user-visible or agent-visible:

`src/App.tsx:297` (reading-face footer: "Kannada and Telugu keep Noto Sans") ·
`index.html:25` meta description · `public/llms.txt:4,22,26,32` ·
`README.md:8` · `docs/ARCHITECTURE_PLAN.md` and `docs/DESIGN_PLAN.md` font and
unicode-range tables · `src/index.css:136-138` comment

**`TODO.md:100` already contains the licence research for Hindi** and names
`Language` in `gita.types.ts` plus `LANGUAGES`/`LANGUAGE_LABELS` in
`settings.tsx` as the gate to decide before touching. Read it before starting.
(`TODO.md:99` is the related `context_kannada` / `context_telugu` coverage gap.)

## Confirmed not per-language

`src/lib/sw.ts`, `bookmarks.ts`, `history.ts`, `keys.ts`, `media.ts`,
`ShortcutsSheet.tsx`, `Header.tsx`, `wrangler.toml`, the PWA manifest in
`vite.config.ts:72-101`, and `<html lang="en">` in `index.html:2`.
