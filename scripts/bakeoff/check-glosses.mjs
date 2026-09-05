// Defect scan for word-by-word glosses. Usage: node check-glosses.mjs <chapter>
// Checks structure against context_english, then the two languages against each other.
import { readFileSync } from 'node:fs';

const KN = [0x0c80, 0x0cff], TE = [0x0c00, 0x0c7f], DEVA = [0x0900, 0x097f];
const inRange = (c, [lo, hi]) => c >= lo && c <= hi;
const toTelugu = (s) => [...s].map((ch) => {
  const c = ch.codePointAt(0);
  return inRange(c, KN) ? String.fromCodePoint(c - 0x80) : ch;
}).join('');

const chapter = Number(process.argv[2] ?? 1);
const raw = JSON.parse(readFileSync(new URL('../../src/data/verses.json', import.meta.url)));
const src = Object.fromEntries((raw.verses ?? raw)
  .filter((v) => v.chapter_id === chapter)
  .map((v) => [String(v.verse_number), v.context_english]));

const kn = JSON.parse(readFileSync(new URL(`./out/ch${chapter}-context-kn.json`, import.meta.url)));
const te = JSON.parse(readFileSync(new URL(`./out/ch${chapter}-context-te.json`, import.meta.url)));

// A gloss is "headword—meaning" items joined by "; ".
// 10 verses use a bare newline where a "; " belongs, and 56 carry a trailing
// semicolon. Normalise both so the item count reflects real glosses.
const items = (s) => s.replace(/\n/g, ';').split(';').map((x) => x.trim()).filter(Boolean);
const head = (item) => item.split('—')[0].trim();

let clean = 0;
const rows = [];
for (const n of Object.keys(src)) {
  const d = [];
  const srcItems = items(src[n]);

  for (const [lang, range, text] of [['kn', KN, kn[n]], ['te', TE, te[n]]]) {
    if (!text || !text.trim()) { d.push(`${lang}: missing`); continue; }
    const got = items(text);
    if (got.length !== srcItems.length) d.push(`${lang}: ${got.length} items, source has ${srcItems.length}`);
    const noDash = got.filter((x) => !x.includes('—')).length;
    if (noDash) d.push(`${lang}: ${noDash} items with no em-dash separator`);

    const letters = [...text].filter((ch) => /\p{L}/u.test(ch));
    const purity = letters.filter((ch) => inRange(ch.codePointAt(0), range)).length / (letters.length || 1);
    if (purity < 0.99) d.push(`${lang}: script purity ${(purity * 100).toFixed(1)}%`);
    if (letters.some((ch) => inRange(ch.codePointAt(0), DEVA))) d.push(`${lang}: Devanagari present`);
    if (/[A-Za-z]{2,}/.test(text)) d.push(`${lang}: Latin letters — "${text.match(/[A-Za-z]{2,}.{0,20}/)[0]}"`);
  }

  // The decisive check: a Sanskrit headword is ONE word in both languages, so every
  // Kannada headword must be the exact codepoint-shifted twin of its Telugu one.
  if (kn[n] && te[n]) {
    const k = items(kn[n]).map(head), t = items(te[n]).map(head);
    if (k.length === t.length) {
      const bad = k.map((h, i) => [h, t[i]]).filter(([a, b]) => toTelugu(a) !== b);
      if (bad.length) d.push(`headword mismatch ${bad.length}/${k.length} — e.g. ${bad[0][0]} vs ${bad[0][1]}`);
    }
  }

  if (!d.length) clean++; else rows.push([n, d]);
}

console.log(`\n=== chapter ${chapter} — ${clean}/${Object.keys(src).length} verses clean ===`);
for (const [n, d] of rows) console.log(`${chapter}.${n}\n${d.map((x) => '  · ' + x).join('\n')}`);
