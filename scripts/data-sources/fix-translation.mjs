#!/usr/bin/env node
// Mechanical repairs to a generated translation, before it reaches
// merge-language.mjs. Same role as fix-corpus.mjs plays for verses.json:
// idempotent, and safe to rerun after regenerating the file.
//
//   node scripts/data-sources/fix-translation.mjs --input <file.json> [--dry]
//
// Only defects with a single unambiguous repair belong here. Anything needing
// a judgement — the bhāṣya register, a cross-script divergence where either
// spelling could be the right one — stays out and goes to a human.
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const input = argv[argv.indexOf('--input') + 1];
if (!input || input.startsWith('--')) {
  console.error('usage: fix-translation.mjs --input <file.json> [--dry]');
  process.exit(2);
}

// IndicTrans2 transliterates these Sanskrit terms with the wrong sibilant or
// aspirate, consistently and in both scripts. The gloss it puts beside them is
// always spelled correctly, which is how they were found — see the ದ್ವೇಶ scan
// in .claude/skills/translator/references/translation-quality.md.
//
// A term earns a row here only when the wrong form is wrong every time it
// appears. Check that before adding one: a form that is right in some contexts
// is not a transliteration slip, and this pass would corrupt it.
const TERMS = [
  // dveṣa — aversion. ಶ (śa) written where ಷ (ṣa) belongs. Nine occurrences in
  // Kannada, six in Telugu, standalone and inside the rāga-dveṣa compound;
  // wrong in every one, with a correctly spelled gloss beside it each time.
  [/ದ್ವೇಶ/g, 'ದ್ವೇಷ'],
  [/ద్వేశ/g, 'ద్వేష'],
  // abhiniveśa — clinging to life, the fifth kleśa. The i-sign is dropped, so
  // the word reads abhinaveśa. Once in each language, at 9.8, never correct.
  [/ಅಭಿನವೇಶ/g, 'ಅಭಿನಿವೇಶ'],
  [/అభినవేశ/g, 'అభినివేశ'],
];

const data = JSON.parse(readFileSync(input, 'utf8'));
const hits = new Map();

for (const [id, text] of Object.entries(data)) {
  let out = text;
  for (const [pattern, replacement] of TERMS) {
    const found = out.match(pattern);
    if (!found) continue;
    hits.set(replacement, (hits.get(replacement) ?? 0) + found.length);
    (hits.verses ??= new Set()).add(id);
    out = out.replace(pattern, replacement);
  }
  data[id] = out;
}

const total = [...hits.entries()]
  .filter(([k]) => typeof k === 'string')
  .reduce((a, [, n]) => a + n, 0);

for (const [replacement, n] of hits) {
  if (typeof replacement === 'string') console.log(`  ${n}x -> ${replacement}`);
}
console.log(`${total} replacements across ${hits.verses?.size ?? 0} verses`
          + `${DRY ? ' (dry run, nothing written)' : ''}`);

if (!DRY && total) writeFileSync(input, `${JSON.stringify(data, null, 2)}\n`);
