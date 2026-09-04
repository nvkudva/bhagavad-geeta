#!/usr/bin/env node
/* Merges scripts/data-sources/kannada-machine-assisted.json into
 * src/data/verses.json.
 *
 * The Kannada is machine-assisted, not a traditional rendering — see the
 * README for the two searches that established no openly-licensed or
 * public-domain Kannada Gita exists in a usable form. Every verse it writes
 * carries translation_kannada_source saying so, and VerseViewer surfaces that
 * to the reader.
 *
 * Idempotent. Refuses to write if any verse would be left without a Kannada
 * translation, or if any translation is not in Kannada script.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const versesPath = join(root, "src", "data", "verses.json");

const verses = JSON.parse(readFileSync(versesPath, "utf8"));
const kannada = JSON.parse(readFileSync(join(root, "scripts", "data-sources", "kannada-machine-assisted.json"), "utf8"));

const SOURCE = "machine-assisted — rendered from the Sanskrit, no traditional Kannada edition";

/** Kannada block, and the two blocks that must never appear in it. */
const KANNADA = /[ಀ-೿]/u;
const DEVANAGARI = /[ऀ-ॿ]/u;
const TELUGU = /[ఀ-౿]/u;
/** Everything that is not a letter of some script: spaces, ASCII punctuation. */
const NEUTRAL = /[\s\d\p{P}\p{S}]/gu;

const problems = [];

for (const verse of verses) {
  const id = `${verse.chapter_id}.${verse.verse_number}`;
  const text = kannada[id];

  if (typeof text !== "string" || text.trim().length < 20) {
    problems.push(`${id}: missing or too short`);
    continue;
  }
  if (DEVANAGARI.test(text)) problems.push(`${id}: contains Devanagari`);
  if (TELUGU.test(text)) problems.push(`${id}: contains Telugu`);

  const letters = text.replace(NEUTRAL, "");
  const kn = [...letters].filter((c) => KANNADA.test(c)).length;
  if (letters.length === 0 || kn / letters.length < 0.92) problems.push(`${id}: only ${Math.round((100 * kn) / Math.max(1, letters.length))}% Kannada`);

  verse.translation_kannada = text.normalize("NFC");
  verse.translation_kannada_source = SOURCE;
}

if (problems.length > 0) {
  console.error(`merge-kannada: ${problems.length} problems:\n${problems.slice(0, 20).join("\n")}`);
  process.exit(1);
}

writeFileSync(versesPath, `${JSON.stringify(verses, null, 2)}\n`);
console.log(`merge-kannada: ${verses.length} translations`);
