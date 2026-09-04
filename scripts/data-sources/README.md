# Data sources

Import scripts and their raw output. These run by hand, not in the build — the
build reads `src/data/verses.json`, which is the checked-in result.

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
`translation_kannada_source` saying so, and the reader is told in the UI.

`translation_kannada` is therefore machine-assisted, rendered from the Sanskrit
with the English and the Telugu alongside it, and every verse carries
`translation_kannada_source` saying so. The reader is told in the UI.
