#!/usr/bin/env node
// Canonical src/data/verses.json -> public/data/v1/*
// Emits byte-stable, minified, stable-key-order JSON so that an unchanged chapter
// keeps its Workbox precache revision across deploys.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src", "data");
const OUT = join(root, "public", "data", "v1");

const VERSE_KEYS = [
  "chapter_id",
  "verse_number",
  "text",
  "text_kannada",
  "text_telugu",
  "transliteration",
  "translation_english",
  "translation_kannada",
  "translation_telugu",
  // Three Telugu verses are composed rather than imported; the reader is told
  // so per verse, which is why this one field ships and the source strings do not.
  "translation_telugu_machine",
  "context_english",
  "context_kannada",
  "context_telugu",
];

// Present in the canonical corpus and deliberately NOT shipped per verse: both hold
// exactly one distinct string across all 701 verses, so they travel once in the
// manifest instead of 701 times in the chapter files. Listing them here is what keeps
// validate() from flagging them as a dropped field.
// Commentary is 29% of the corpus and is never on screen at first paint — the home
// screen's verse card does not show it at all. It ships as commentary-NN.json, which
// the reader loads in parallel with its chapter and nothing else loads at all.
const COMMENTARY_KEYS = ["verse_number", "commentary_english", "commentary_author"];

const SOURCE_KEYS = ["translation_telugu_source", "translation_kannada_source"];

const CHAPTER_KEYS = [
  "id",
  "name",
  "name_kannada",
  "name_telugu",
  "name_meaning",
  "name_meaning_kannada",
  "name_meaning_telugu",
  "verses_count",
  "summary",
  "summary_kannada",
  "summary_telugu",
];

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
};

const sha256 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Write only when the bytes actually change, so mtimes and hashes stay stable. */
const writeStable = (path, contents) => {
  if (existsSync(path) && readFileSync(path, "utf8") === contents) return false;
  writeFileSync(path, contents);
  return true;
};

const verses = JSON.parse(readFileSync(join(SRC, "verses.json"), "utf8"));
const chapters = JSON.parse(readFileSync(join(SRC, "chapters.json"), "utf8"));

/* A ratchet, not a repair: every rule below passes against the corpus as it stands.
   pick() silently drops any key it does not know, so before this existed, renaming a
   corpus field produced a clean build that quietly shipped nothing. */
const KNOWN_KEYS = new Set([...VERSE_KEYS, ...COMMENTARY_KEYS, ...SOURCE_KEYS]);
const KANNADA = /[\u0C80-\u0CFF]/;
const TELUGU = /[\u0C00-\u0C7F]/;
const DEVANAGARI = /[\u0900-\u097F]/;

function validate() {
  const errors = [];
  const seen = new Set();
  const byId = new Map();

  for (const v of verses) {
    const ref = `${v.chapter_id}.${v.verse_number}`;
    for (const k of Object.keys(v)) {
      if (!KNOWN_KEYS.has(k)) errors.push(`unknown field "${k}" on verse ${ref} — add it to VERSE_KEYS or SOURCE_KEYS`);
    }
    if (seen.has(ref)) errors.push(`duplicate verse ${ref}`);
    seen.add(ref);
    if (!byId.has(v.chapter_id)) byId.set(v.chapter_id, []);
    byId.get(v.chapter_id).push(v.verse_number);

    for (const [field, re, script] of [
      ["text_kannada", KANNADA, "Kannada"],
      ["translation_kannada", KANNADA, "Kannada"],
      ["text_telugu", TELUGU, "Telugu"],
      ["translation_telugu", TELUGU, "Telugu"],
    ]) {
      if (v[field] && !re.test(v[field])) errors.push(`${field} on verse ${ref} contains no ${script} script`);
    }
    /* The residue of the word-gloss import. NOT "commentary contains no Devanagari":
       eight verses legitimately quote the Upanishads or the Manu Smriti in Devanagari
       mid-paragraph. The defect is a gloss LIST pasted in front of the prose, which
       always has the word "Commentary" separating the two. */
    if (v.commentary_english && DEVANAGARI.test(v.commentary_english)) {
      const split = /\bCommentary\b/.exec(v.commentary_english);
      if (split && DEVANAGARI.test(v.commentary_english.slice(0, split.index))) {
        errors.push(`commentary_english on verse ${ref} opens with a Devanagari gloss run — run scripts/data-sources/fix-corpus.mjs`);
      }
    }
  }

  for (const meta of chapters) {
    const numbers = (byId.get(meta.id) ?? []).slice().sort((a, b) => a - b);
    if (numbers.length !== meta.verses_count) {
      errors.push(`chapter ${meta.id} has ${numbers.length} verses, chapters.json says ${meta.verses_count}`);
    }
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) {
        errors.push(`chapter ${meta.id} verse sequence breaks at ${numbers[i]} (expected ${i + 1})`);
        break;
      }
    }
  }

  if (errors.length) {
    console.error("build-data: corpus validation failed\n  " + errors.join("\n  "));
    process.exit(1);
  }
}

validate();

mkdirSync(OUT, { recursive: true });

const byChapter = new Map();
const commentaryByChapter = new Map();
for (const v of verses) {
  if (!byChapter.has(v.chapter_id)) byChapter.set(v.chapter_id, []);
  byChapter.get(v.chapter_id).push(pick(v, VERSE_KEYS));
  if (!commentaryByChapter.has(v.chapter_id)) commentaryByChapter.set(v.chapter_id, []);
  commentaryByChapter.get(v.chapter_id).push(pick(v, COMMENTARY_KEYS));
}
const byVerseNumber = (a, b) => a.verse_number - b.verse_number;
for (const list of byChapter.values()) list.sort(byVerseNumber);
for (const list of commentaryByChapter.values()) list.sort(byVerseNumber);

const manifestChapters = [];
const expected = new Set(["manifest.json", "chapters.json"]);

for (const meta of chapters) {
  const list = byChapter.get(meta.id) ?? [];
  const pad = String(meta.id).padStart(2, "0");
  const file = `chapter-${pad}.json`;
  const contents = JSON.stringify(list);
  expected.add(file);
  writeStable(join(OUT, file), contents);

  // Only verses that actually have commentary: 1.15 has none, and an entry of
  // {"verse_number":15} would be a row the reader has to skip for no reason.
  const commentaryFile = `commentary-${pad}.json`;
  const commentaryContents = JSON.stringify((commentaryByChapter.get(meta.id) ?? []).filter((c) => c.commentary_english));
  expected.add(commentaryFile);
  writeStable(join(OUT, commentaryFile), commentaryContents);

  manifestChapters.push({
    id: meta.id,
    file,
    verses: list.length,
    bytes: Buffer.byteLength(contents),
    sha: sha256(contents),
    commentary_file: commentaryFile,
    commentary_bytes: Buffer.byteLength(commentaryContents),
    commentary_sha: sha256(commentaryContents),
  });
}

writeStable(join(OUT, "chapters.json"), JSON.stringify(chapters.map((c) => pick(c, CHAPTER_KEYS))));

// Search index: one positional row per verse, carrying only the fields worth
// matching on. Commentary and word glosses are deliberately excluded — they are
// 75% of the corpus and searching them returns the essay, not the verse.
// [chapter, verse, devanagari, kannada, telugu, transliteration, english]
const searchRows = [];
for (const meta of chapters) {
  for (const v of byChapter.get(meta.id) ?? []) {
    searchRows.push([v.chapter_id, v.verse_number, v.text ?? "", v.text_kannada ?? "", v.text_telugu ?? "", v.transliteration ?? "", v.translation_english ?? ""]);
  }
}
const searchContents = JSON.stringify({ schema: 1, rows: searchRows });
expected.add("search-index.json");
writeStable(join(OUT, "search-index.json"), searchContents);

// Keep `generated` stable when nothing about the corpus changed.
const manifestPath = join(OUT, "manifest.json");
let generated = new Date().toISOString();
if (existsSync(manifestPath)) {
  try {
    const prev = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (JSON.stringify(prev.chapters) === JSON.stringify(manifestChapters) && typeof prev.generated === "string") {
      generated = prev.generated;
    }
  } catch {
    /* regenerate */
  }
}
// One entry per field, so the coverage numbers live in the artefact rather than in a
// hand-written comment that goes stale the moment a merge script runs.
const coverage = {};
for (const k of [...VERSE_KEYS, ...COMMENTARY_KEYS]) coverage[k] = verses.filter((v) => v[k] !== undefined && v[k] !== null && v[k] !== "").length;

// The two provenance strings are constant across all 701 verses, so they ship once here.
const sources = {};
for (const k of SOURCE_KEYS) {
  const distinct = [...new Set(verses.map((v) => v[k]).filter(Boolean))];
  if (distinct.length === 1) sources[k.replace(/_source$/, "")] = distinct[0];
  else if (distinct.length) sources[k.replace(/_source$/, "")] = distinct;
}

writeStable(manifestPath, JSON.stringify({ schema: 1, generated, sources, coverage, chapters: manifestChapters }));

// Drop files from a previous run that no longer belong (e.g. a removed chapter).
for (const name of readdirSync(OUT)) {
  if (!expected.has(name)) rmSync(join(OUT, name), { recursive: true, force: true });
}

const total = manifestChapters.reduce((n, c) => n + c.bytes, 0);
const totalCommentary = manifestChapters.reduce((n, c) => n + c.commentary_bytes, 0);
console.log(`build-data: ${manifestChapters.length} chapters, ${verses.length} verses, ${(total / 1024).toFixed(1)} KB raw + ${(totalCommentary / 1024).toFixed(1)} KB commentary -> public/data/v1/`);
console.log(`build-data: coverage ${Object.entries(coverage).map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`build-data: search index ${searchRows.length} rows, ${(Buffer.byteLength(searchContents) / 1024).toFixed(1)} KB raw`);
