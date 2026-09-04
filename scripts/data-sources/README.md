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

Checked and rejected: kn.wikisource (Sanskrit in Kannada script only, plus one
unproofread OCR scan), GitHub (one 701-verse dataset, unlicensed and itself
machine-generated), HuggingFace (script transliterations, not translations),
gitasupersite.in (no data API, IIT-Kanpur copyright), archive.org (the 1936
PD-in-India text is old-Kannada ṣaṭpadi metre with no verse alignment).
Modern translations — Bannanje, Chinmayananda, Prabhupada — are in copyright.

`translation_kannada` is therefore machine-assisted, rendered from the Sanskrit
with the English and the Telugu alongside it, and every verse carries
`translation_kannada_source` saying so. The reader is told in the UI.
