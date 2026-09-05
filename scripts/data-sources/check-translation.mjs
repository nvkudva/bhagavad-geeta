#!/usr/bin/env node
// Defect scan for a generated translation, before it goes anywhere near
// merge-language.mjs. Reports a clean/total count and lists every defect.
//
//   node scripts/data-sources/check-translation.mjs \
//     --source commentary_english \
//     --kannada scripts/data-sources/commentary-kannada-mt.json \
//     [--telugu scripts/data-sources/commentary-telugu-mt.json] [--verbose]
//
// Both files are the shape merge-language.mjs consumes: { "chapter.verse": text }.
// The cross-script check needs both languages and is skipped with only one.
//
// This is the layer above merge-language.mjs, which enforces script purity and
// refuses a wrong-script merge. What is here is everything that survives a
// well-formed merge: untranslated words, a lost paragraph, a Sanskrit term
// spelled two different ways across the two scripts.
//
// Exits non-zero if any blocking defect class is non-empty.
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const VERBOSE = argv.includes('--verbose');
const SOURCE_FIELD = arg('source', 'commentary_english');
const FILES = { kannada: arg('kannada'), telugu: arg('telugu') };
if (!FILES.kannada && !FILES.telugu) {
  console.error('need at least one of --kannada / --telugu');
  process.exit(2);
}

const verses = JSON.parse(readFileSync('src/data/verses.json', 'utf8'));
const mt = {};
for (const [lang, file] of Object.entries(FILES)) {
  if (!file) continue;
  for (const [id, text] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) {
    (mt[id] ??= {})[lang] = text;
  }
}

const KN = [0x0c80, 0x0cff];   // Kannada block
const TE = [0x0c00, 0x0c7f];   // Telugu block, exactly 0x80 below Kannada
const DEVA = [0x0900, 0x097f];
const OFFSET = 0x80;

const inBlock = (cp, [lo, hi]) => cp >= lo && cp <= hi;
const BLOCK = { kannada: KN, telugu: TE };

// ── metrics ────────────────────────────────────────────────────────────────

// Scholarly citations stay in Latin on purpose, in the source and in the
// translation alike: "(Cf.XVIII.17)", "B. S. 1.1.11-19", "cf. Br. 4.4.22",
// and the "-Tr" that marks a translator's note. Counting them as impurity
// penalises correct output, so they come out before the ratio is taken.
const CITATION =
  /\b(?:[CcSs]f|Tr|Br|Ast|Pr|Ch|Cp|B|S|A|G\d|V\.S\.A|Comm|Ibid|ib)\b\.?|(?<![A-Za-z])[IVXLC]{1,7}(?![A-Za-z])\.?/g;
const stripCitations = (t) => t.replace(CITATION, ' ');

// Preserved scripture quotations are not impurity — they are the source's own
// Devanagari, kept deliberately. Excluded from the ratio for the same reason
// citations are.
const DEVA_RUN = /[\u0900-\u097f][\u0900-\u097f\s\u0964\u0965]*/g;

// Purity over letters only: digits, spaces and shared punctuation are not
// evidence either way, so counting them would inflate every score.
function purity(text, block) {
  let hit = 0, total = 0;
  for (const ch of stripCitations(text).replace(DEVA_RUN, ' ')) {
    const cp = ch.codePointAt(0);
    if (/[\s\d\p{P}\p{S}]/u.test(ch)) continue;
    total++;
    if (inBlock(cp, block)) hit++;
  }
  return total ? hit / total : 1;
}

// A lowercase Latin word the model passed through instead of translating.
// Distinct from the 3+-word run check: these arrive singly, usually glued to a
// citation marker ("heaven.-Tr", "self.-Tr") so the tokenizer never saw a word.
const untranslated = (t) =>
  [...new Set((stripCitations(t).match(/\b[a-z]{3,}\b/g) ?? []))];

// Devanagari runs, normalised for comparison. Eight verses quote scripture in
// script inside English prose and the runs are meant to survive translation
// verbatim, so the test is not "is there Devanagari" — it is "are these the
// same runs the source had". That catches a lost quotation, which is what
// actually happens, as well as a leaked one.
const devaRuns = (t) =>
  (t.match(/[\u0900-\u097f][\u0900-\u097f\s\u0964\u0965]*/g) ?? [])
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

// Three or more consecutive Latin words: an untranslated clause, as opposed to
// an inline abbreviation or a numeral the model quite properly passed through.
const latinRuns = (t) => t.match(/[A-Za-z]{2,}(?:[ \t]+[A-Za-z]{2,}){2,}/g) ?? [];

const paras = (t) => t.split(/\n+/).filter((p) => p.trim()).length;

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// ── cross-script consistency ───────────────────────────────────────────────
// Kannada and Telugu occupy the same block layout 0x80 apart, and the corpus's
// own text_kannada / text_telugu agree on that offset with zero exceptions
// across all 65,838 characters. So a Sanskrit term that surfaces in both
// translations must be an exact offset pair. Stems are compared at 4 chars
// because the two languages inflect a shared stem differently past that.

const STEM = 4;
const toKannadaSpace = (s) =>
  [...s].map((c) => {
    const cp = c.codePointAt(0);
    return inBlock(cp, TE) ? String.fromCodePoint(cp + OFFSET) : c;
  }).join('');

// The Sanskrit vocabulary of this corpus, in Kannada space: every stem of the
// ślokas themselves. Restricting the check to these is what makes it mean
// something — comparing every word in the two translations flags ordinary
// Kannada/Telugu vocabulary that was never meant to match.
const SANSKRIT = new Set();
for (const v of verses) {
  for (const [f, up] of [['text_kannada', false], ['text_telugu', true]]) {
    for (const w of (v[f] ?? '').split(/[^\p{L}\p{M}]+/u)) {
      if (w.length >= 5) SANSKRIT.add((up ? toKannadaSpace(w) : w).slice(0, STEM));
    }
  }
}

function stems(text, mapUp) {
  const out = new Map();
  for (const w of text.split(/[^\p{L}\p{M}]+/u)) {
    if (w.length < 5) continue;                    // too short to carry a stem
    const s = (mapUp ? toKannadaSpace(w) : w).slice(0, STEM);
    if (SANSKRIT.has(s) && !out.has(s)) out.set(s, w);
  }
  return out;
}

// A near-miss is a Sanskrit term whose exact offset counterpart is missing from
// the other script but which has a one-character neighbour there: the same word
// rendered two different ways. An absent counterpart is normal — the two
// languages inflect a shared stem differently — so the comparison is made on
// whole words of six characters or more, where a single differing character is
// evidence rather than coincidence. Four-character stems are far too short:
// at that length almost every word has a distance-1 neighbour by accident.
const MIN_WORD = 6;

function crossScript(kn, te) {
  const a = stems(kn, false), b = stems(te, true);
  const bad = [];
  for (const [s, wordKn] of a) {
    if (b.has(s)) continue;                        // exact offset pair: correct
    if (wordKn.length < MIN_WORD) continue;
    for (const [, wordTe] of b) {
      const mapped = toKannadaSpace(wordTe);
      if (mapped.length >= MIN_WORD && editDistance(wordKn, mapped) === 1) {
        bad.push(`${wordKn} / ${wordTe}`);
        break;
      }
    }
  }
  return bad;
}

// ── the ದ್ವೇಶ class ────────────────────────────────────────────────────────
// The model transliterates a Sanskrit term, then translates the English gloss
// beside it to the same term spelled correctly, yielding "ದ್ವೇಶ ಅಥವಾ ದ್ವೇಷ" —
// a misspelling, "or", and the correct spelling of the same word.
const OR = /(\p{L}[\p{L}\p{M}]{2,})\s+(?:ಅಥವಾ|లేదా|or)\s+(\p{L}[\p{L}\p{M}]{2,})/gu;

// The axes on which the model misspells a Sanskrit transliteration, written in
// Kannada codepoints (Telugu maps onto these by the same 0x80 offset): the
// three sibilants, the ten unaspirated/aspirated stop pairs, and the short/long
// vowel pairs. ದ್ವೇಶ for ದ್ವೇಷ is a sibilant slip; ಧ್ರುವ rendered ద్రువ is an
// aspiration slip. A substituted character outside these sets is a case ending
// or a different word, not a misspelling.
const CONFUSABLE = [
  [0x0cb6, 0x0cb7, 0x0cb8],                              // ಶ ಷ ಸ
  [0x0c95, 0x0c96], [0x0c97, 0x0c98], [0x0c9a, 0x0c9b],  // ಕಖ ಗಘ ಚಛ
  [0x0c9c, 0x0c9d], [0x0c9f, 0x0ca0], [0x0ca1, 0x0ca2],  // ಜಝ ಟಠ ಡಢ
  [0x0ca4, 0x0ca5], [0x0ca6, 0x0ca7], [0x0caa, 0x0cab],  // ತಥ ದಧ ಪಫ
  [0x0cac, 0x0cad],                                      // ಬಭ
  [0x0c85, 0x0c86], [0x0c87, 0x0c88], [0x0c89, 0x0c8a],  // ಅಆ ಇಈ ಉಊ
  [0x0cbf, 0x0cc0], [0x0cc1, 0x0cc2],                    // ಿೀ ುೂ
  [0x0cc6, 0x0cc7], [0x0cca, 0x0ccb],                    // ೆೇ ೊೋ
];

function confusable(a, b) {
  const up = (c) => {
    const cp = c.codePointAt(0);
    return inBlock(cp, TE) ? cp + OFFSET : cp;
  };
  const [x, y] = [up(a), up(b)];
  return CONFUSABLE.some((g) => g.includes(x) && g.includes(y));
}

// The two sides are rarely the same length — the corrected form usually carries
// an inflection or a glued verb, as in "ದ್ವೇಶ ಅಥವಾ ದ್ವೇಷವಿದೆ" — so the
// comparison runs over the shared prefix and asks for exactly one substituted
// character in it. A pure suffix difference (zero substitutions) is a case
// ending; a difference at the first character is a privative a-, i.e. an
// antonym pair. Both are correct and neither is counted.
function oneCharApart(l, r) {
  const n = Math.min(l.length, r.length);
  if (n < 4) return false;
  let diff = 0, at = -1;
  for (let i = 0; i < n; i++) if (l[i] !== r[i]) { diff++; at = i; }
  return diff === 1 && at > 0 && confusable(l[at], r[at]);
}

// "X or X": the model transliterated a Sanskrit term AND translated its English
// gloss to that same term, so the gloss says nothing — "ದ್ವೇಷ ಅಥವಾ ದ್ವೇಷವಿದೆ",
// dveṣa or dveṣa. Correcting the spelling of the ದ್ವೇಶ class turns those pairs
// from a misspelling into a tautology; the right rendering drops one side, which
// takes grammar the fix pass does not have. Reported, not repaired.
function redundantGloss(text) {
  const bad = [];
  for (const m of text.matchAll(OR)) {
    const [, l, r] = m;
    if (l === r || (l.length >= 4 && (r.startsWith(l) || l.startsWith(r))))
      bad.push(`${l} … ${r}`);
  }
  return bad;
}

function orPairs(text) {
  const bad = [];
  for (const m of text.matchAll(OR)) {
    const [, l, r] = m;
    // One word being a prefix of the other is a case ending — "ಆತ್ಮ ಅಥವಾ
    // ಆತ್ಮದ" is "the self or of-the-self", which is correct. Only a
    // substitution inside the word is the ದ್ವೇಶ/ದ್ವೇಷ defect.
    if (l !== r && oneCharApart(l, r)) bad.push(`${l} … ${r}`);
  }
  return bad;
}

// ── run ────────────────────────────────────────────────────────────────────

const src = new Map(
  verses.filter((v) => v[SOURCE_FIELD])
        .map((v) => [`${v.chapter_id}.${v.verse_number}`, v]),
);

const defects = {
  'missing from staging file': [],
  'script purity below 98%': [],
  'devanagari quotation lost from source': [],
  'devanagari not present in the source': [],
  'untranslated latin run (3+ words)': [],
  'untranslated english word': [],
  'paragraph count differs from english': [],
  'length ratio outside 0.55–1.9': [],
  'cross-script sanskrit stem mismatch': [],
  'misspelling-or-correct pair (ದ್ವೇಶ class)': [],
  'redundant gloss — X or X': [],
};

let total = 0;
const dirty = new Set();
const flag = (cls, id, detail) => {
  defects[cls].push(`${id}  ${detail}`);
  dirty.add(id);
};

for (const [id, v] of src) {
  total++;
  const rec = mt[id];
  if (!rec) { flag('missing from staging file', id, ''); continue; }

  const en = v[SOURCE_FIELD];
  const enParas = paras(en);

  for (const lang of Object.keys(FILES).filter((l) => FILES[l])) {
    const t = rec[lang];
    if (!t) { flag('missing from staging file', id, `${lang} empty`); continue; }

    const p = purity(t, BLOCK[lang]);
    if (p < 0.98) flag('script purity below 98%', id,
                       `${lang} ${(p * 100).toFixed(1)}%`);

    const want = devaRuns(en);
    const got = devaRuns(t);
    for (const run of want) {
      if (!got.includes(run))
        flag('devanagari quotation lost from source', id,
             `${lang} "${run.slice(0, 40)}"`);
    }
    for (const run of got) {
      if (!want.includes(run))
        flag('devanagari not present in the source', id,
             `${lang} "${run.slice(0, 40)}"`);
    }

    for (const run of latinRuns(t))
      flag('untranslated latin run (3+ words)', id, `${lang} "${run.slice(0, 60)}"`);

    const eng = untranslated(t);
    if (eng.length)
      flag('untranslated english word', id, `${lang} ${eng.join(', ')}`);

    if (paras(t) !== enParas)
      flag('paragraph count differs from english', id,
           `${lang} ${paras(t)} vs ${enParas}`);

    const ratio = t.length / en.length;
    if (ratio < 0.55 || ratio > 1.9)
      flag('length ratio outside 0.55–1.9', id, `${lang} ${ratio.toFixed(2)}`);

    for (const pair of orPairs(t))
      flag('misspelling-or-correct pair (ದ್ವೇಶ class)', id, `${lang} ${pair}`);

    for (const pair of redundantGloss(t))
      flag('redundant gloss — X or X', id, `${lang} ${pair}`);
  }

  if (rec.kannada && rec.telugu) {
    for (const pair of crossScript(rec.kannada, rec.telugu))
      flag('cross-script sanskrit stem mismatch', id, pair);
  }
}

// ── report ─────────────────────────────────────────────────────────────────

const clean = total - dirty.size;
const scanned = Object.keys(FILES).filter((l) => FILES[l]).join(' + ');
console.log(`\n${SOURCE_FIELD} -> ${scanned} — ${clean}/${total} verses clean `
          + `(${((clean / total) * 100).toFixed(1)}%)\n`);

let blocking = 0;
for (const [cls, list] of Object.entries(defects)) {
  console.log(`${String(list.length).padStart(5)}  ${cls}`);
  if (list.length) blocking++;
  const show = VERBOSE ? list : list.slice(0, 20);
  for (const d of show) console.log(`         ${d}`);
  if (!VERBOSE && list.length > show.length)
    console.log(`         … ${list.length - show.length} more (--verbose)`);
}

// The bhāṣya verses are where this model fails structurally rather than
// cosmetically, and nothing above can see that. Count them so the number is in
// front of whoever reads this report.
const BHASYA = new Set(['Sri Shankaracharya', 'Sri Ramanuja']);
const bhasya = [...src.values()].filter((v) => BHASYA.has(v.commentary_author));
console.log(`\n${bhasya.length} of these verses are bhāṣya (Śaṅkara, Rāmānuja). `
          + 'No check here can see the failure mode that matters on them — the '
          + 'technical register flattening. Read them, or regenerate with a '
          + 'stronger model.');
process.exit(blocking ? 1 : 0);
