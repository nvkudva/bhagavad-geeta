// Pick a stratified 20-verse sample: all three commentators, short/median/long.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('../../src/data/verses.json', import.meta.url)));
const all = raw.verses ?? raw;

const QUOTA = { 'Swami Sivananda': 12, 'Sri Ramanuja': 5, 'Sri Shankaracharya': 3 };
const pick = [];

for (const [author, n] of Object.entries(QUOTA)) {
  const pool = all
    .filter((v) => v.commentary_author === author && typeof v.commentary_english === 'string')
    .sort((a, b) => a.commentary_english.length - b.commentary_english.length);
  // even spread across the length distribution, so short and long both get tested
  for (let i = 0; i < n; i++) pick.push(pool[Math.floor((i + 0.5) * pool.length / n)]);
}

const out = pick.map((v) => ({
  id: `${v.chapter_id}.${v.verse_number}`,
  author: v.commentary_author,
  sanskrit: v.text,
  translation_english: v.translation_english,
  translation_kannada: v.translation_kannada,
  translation_telugu: v.translation_telugu,
  commentary_english: v.commentary_english,
}));

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/sample.json', import.meta.url), JSON.stringify(out, null, 2));

const chars = out.reduce((s, v) => s + v.commentary_english.length, 0);
console.log(`${out.length} verses, ${chars} chars of commentary`);
console.log(out.map((v) => `${v.id} ${v.author} ${v.commentary_english.length}c`).join('\n'));
