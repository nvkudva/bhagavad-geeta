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
  "commentary_english",
  "commentary_author",
  "context_kannada",
  "context_telugu",
];

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

mkdirSync(OUT, { recursive: true });

const byChapter = new Map();
for (const v of verses) {
  if (!byChapter.has(v.chapter_id)) byChapter.set(v.chapter_id, []);
  byChapter.get(v.chapter_id).push(pick(v, VERSE_KEYS));
}
for (const list of byChapter.values()) list.sort((a, b) => a.verse_number - b.verse_number);

const manifestChapters = [];
const expected = new Set(["manifest.json", "chapters.json"]);

for (const meta of chapters) {
  const list = byChapter.get(meta.id) ?? [];
  if (list.length !== meta.verses_count) {
    console.warn(`build-data: chapter ${meta.id} has ${list.length} verses, chapters.json says ${meta.verses_count}`);
  }
  const file = `chapter-${String(meta.id).padStart(2, "0")}.json`;
  const contents = JSON.stringify(list);
  expected.add(file);
  writeStable(join(OUT, file), contents);
  manifestChapters.push({
    id: meta.id,
    file,
    verses: list.length,
    bytes: Buffer.byteLength(contents),
    sha: sha256(contents),
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
writeStable(manifestPath, JSON.stringify({ schema: 1, generated, chapters: manifestChapters }));

// Drop files from a previous run that no longer belong (e.g. a removed chapter).
for (const name of readdirSync(OUT)) {
  if (!expected.has(name)) rmSync(join(OUT, name), { recursive: true, force: true });
}

const total = manifestChapters.reduce((n, c) => n + c.bytes, 0);
console.log(`build-data: ${manifestChapters.length} chapters, ${verses.length} verses, ${(total / 1024).toFixed(1)} KB raw -> public/data/v1/`);
console.log(`build-data: search index ${searchRows.length} rows, ${(Buffer.byteLength(searchContents) / 1024).toFixed(1)} KB raw`);
