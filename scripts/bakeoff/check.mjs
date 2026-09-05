// Vendor-neutral defect scan. Usage: node check.mjs out/deepseek.json [out/claude.json ...]
import { readFileSync } from 'node:fs';

const KN = [0x0c80, 0x0cff], TE = [0x0c00, 0x0c7f], DEVA = [0x0900, 0x097f];
const inRange = (c, [lo, hi]) => c >= lo && c <= hi;
const isLetter = (ch) => /\p{L}/u.test(ch);
const toTelugu = (s) => [...s].map((ch) => {
  const c = ch.codePointAt(0);
  return inRange(c, KN) ? String.fromCodePoint(c - 0x80) : ch;
}).join('');

const sample = JSON.parse(readFileSync(new URL('./out/sample.json', import.meta.url)));
const byId = Object.fromEntries(sample.map((v) => [v.id, v]));
const only = process.env.IDS?.split(',');
const ids = Object.keys(byId).filter((id) => !only || only.includes(id));

function scan(id, out) {
  const src = byId[id];
  const d = [];
  if (out.error) return [`API error: ${out.error}`];

  for (const [lang, range, text] of [['kannada', KN, out.kannada], ['telugu', TE, out.telugu]]) {
    if (!text || !text.trim()) { d.push(`${lang}: empty`); continue; }
    const letters = [...text].filter(isLetter);
    const right = letters.filter((ch) => inRange(ch.codePointAt(0), range)).length;
    const purity = right / (letters.length || 1);
    if (purity < 0.98) d.push(`${lang}: script purity ${(purity * 100).toFixed(1)}%`);

    const deva = letters.filter((ch) => inRange(ch.codePointAt(0), DEVA)).length;
    if (deva) d.push(`${lang}: ${deva} Devanagari chars`);

    const englishRun = text.match(/(?:\b[A-Za-z][A-Za-z'-]*\b[ ,]+){3,}\b[A-Za-z][A-Za-z'-]*\b/g);
    if (englishRun) d.push(`${lang}: untranslated English — "${englishRun[0].slice(0, 50)}"`);

    const srcParas = src.commentary_english.split(/\n+/).filter((p) => p.trim()).length;
    const outParas = text.split(/\n+/).filter((p) => p.trim()).length;
    if (srcParas !== outParas) d.push(`${lang}: ${outParas} paragraphs, source has ${srcParas}`);

    const ratio = text.length / src.commentary_english.length;
    if (ratio < 0.55 || ratio > 1.9) d.push(`${lang}: length ratio ${ratio.toFixed(2)} vs English`);

    // A complete rendering ends the way its source does; only flag a bare
    // dangling letter, which is what an actual mid-word cutoff looks like.
    const lastSrc = src.commentary_english.trim().slice(-1);
    const lastOut = text.trim().slice(-1);
    if (/\p{L}|\p{M}/u.test(lastOut) && !/\p{L}/u.test(lastSrc)) d.push(`${lang}: truncated? ends "${text.trim().slice(-25)}"`);
  }

  // Cross-script agreement: Sanskrit loanwords shared by both outputs must be exact
  // codepoint pairs. Low agreement = the two languages drifted apart.
  if (out.kannada && out.telugu) {
    // Compare 4-char stems, not whole words: Kannada and Telugu inflect the same
    // Sanskrit stem differently, so whole-word matching scores ~0% even on the
    // published human translations. Threshold is their measured p5.
    const stem = (t) => [...new Set(t.split(/\s+/).filter((w) => w.length > 3).map((w) => w.slice(0, 4)))];
    const knStems = stem(out.kannada);
    const teSet = new Set(stem(out.telugu));
    const rate = knStems.filter((w) => teSet.has(toTelugu(w))).length / (knStems.length || 1);
    if (rate < 0.06) d.push(`cross-script stem agreement ${(rate * 100).toFixed(0)}% — below the published-translation p5 of 6%`);
  }
  return d;
}

for (const file of process.argv.slice(2)) {
  const data = JSON.parse(readFileSync(file));
  let clean = 0;
  const rows = [];
  for (const id of ids) {
    const out = data[id];
    if (!out) { rows.push([id, ['missing from output']]); continue; }
    const d = scan(id, out);
    if (!d.length) clean++; else rows.push([id, d]);
  }
  console.log(`\n=== ${file} — ${clean}/${ids.length} clean ===`);
  for (const [id, d] of rows) console.log(`${id.padEnd(6)} ${byId[id].author}\n${d.map((x) => '  · ' + x).join('\n')}`);
}
