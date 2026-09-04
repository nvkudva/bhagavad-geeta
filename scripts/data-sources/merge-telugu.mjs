#!/usr/bin/env node
/* Merges scripts/data-sources/telugu-wikisource.json into src/data/verses.json.
 *
 * Idempotent: re-running with a refreshed fetch overwrites the same fields and
 * touches nothing else. Refuses to write if any of the 701 verses would be left
 * without a Telugu translation.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const versesPath = join(root, "src", "data", "verses.json");

const verses = JSON.parse(readFileSync(versesPath, "utf8"));
const telugu = JSON.parse(readFileSync(join(root, "scripts", "data-sources", "telugu-wikisource.json"), "utf8"));

const SOURCE = "te.wikisource.org — భగవద్గీత తెలుగు అనువాదము (CC BY-SA 4.0)";

let translated = 0;
let commented = 0;
const missing = [];

for (const verse of verses) {
  const row = telugu[`${verse.chapter_id}.${verse.verse_number}`];
  if (!row || !row.translation_telugu) {
    missing.push(`${verse.chapter_id}.${verse.verse_number}`);
    continue;
  }
  verse.translation_telugu = row.translation_telugu;
  verse.translation_telugu_source = SOURCE;
  translated += 1;
  if (row.commentary_telugu) {
    verse.context_telugu = row.commentary_telugu;
    commented += 1;
  }
}

if (missing.length > 0) {
  console.error(`merge-telugu: ${missing.length} verses have no translation: ${missing.slice(0, 10).join(", ")}…`);
  process.exit(1);
}

writeFileSync(versesPath, `${JSON.stringify(verses, null, 2)}\n`);
console.log(`merge-telugu: ${translated} translations, ${commented} commentary blocks`);
