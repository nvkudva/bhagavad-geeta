#!/usr/bin/env node
/* Re-runnable integrity checker for src/data/verses.json.
 *
 * Implements the audit checklist: (A) script/encoding integrity, (B) orthography
 * and punctuation, (C) transliteration, (E) structure, (F) rendering safety.
 * Check D (translation fidelity) needs a reader, not a script; this only flags
 * the mechanical proxies for it — speaker-formula presence, blob repetition,
 * cross-batch term drift.
 *
 * Reports counts per defect class and exits non-zero if any BLOCKER class is
 * non-empty. Never mutates the corpus.
 *
 *   node scripts/data-sources/check-corpus.mjs          # summary
 *   node scripts/data-sources/check-corpus.mjs --verbose # + first 12 ids per class
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const verses = JSON.parse(readFileSync(join(root, "src", "data", "verses.json"), "utf8"));
const verbose = process.argv.includes("--verbose");

/* ---------- recension ---------------------------------------------------- */
/* 701-verse recension: chapter 13 opens with the extra `अर्जुन उवाच । प्रकृतिं
 * पुरुषं चैव…` verse, so ch.13 has 35 verses, not 34. */
const RECENSION = "701 (Gita Press / ch.13 opens with the extra अर्जुन उवाच verse)";
const EXPECTED = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 35, 27, 20, 24, 28, 78];

/* ---------- unicode blocks ----------------------------------------------- */
const BLOCK = {
  devanagari: /[ऀ-ॿ]/u,
  kannada: /[ಀ-೿]/u,
  telugu: /[ఀ-౿]/u,
};
const LETTERS = /[^\s\d\p{P}\p{S}\u200B-\u200F\u0964\u0965]/gu;
const LATIN = /[A-Za-z]/;

/** Share of letter-ish codepoints in `text` that fall inside `block`. */
const blockShare = (text, block) => {
  const letters = (text.match(LETTERS) || []).filter((c) => !/\s/.test(c));
  if (!letters.length) return 1;
  return letters.filter((c) => block.test(c)).length / letters.length;
};

/* ---------- defect registry ---------------------------------------------- */
const classes = new Map();
const flag = (cls, id, detail = "") => {
  if (!classes.has(cls)) classes.set(cls, []);
  classes.get(cls).push(detail ? `${id} ${detail}` : id);
};

/* ---------- E. structure -------------------------------------------------- */
const FIELDS = [
  "chapter_id", "verse_number", "text", "text_kannada", "text_telugu",
  "transliteration", "translation_english", "translation_kannada",
  "translation_telugu", "context_english", "context_kannada", "context_telugu",
  "commentary_english", "commentary_author",
];
const seen = new Set();
const perChapter = new Map();

for (const v of verses) {
  const id = `${v.chapter_id}.${v.verse_number}`;
  if (seen.has(id)) flag("E-duplicate-key", id);
  seen.add(id);
  perChapter.set(v.chapter_id, (perChapter.get(v.chapter_id) || 0) + 1);

  for (const f of FIELDS) {
    if (!(f in v)) flag("E-field-absent", id, f);
    else if (v[f] === "") flag("E-empty-string-not-null", id, f);
  }
}
EXPECTED.forEach((n, i) => {
  const ch = i + 1;
  if ((perChapter.get(ch) || 0) !== n) flag("E-chapter-verse-count", `ch${ch}`, `${perChapter.get(ch) || 0}!=${n}`);
  for (let n2 = 1; n2 <= n; n2 += 1) if (!seen.has(`${ch}.${n2}`)) flag("E-verse-gap", `${ch}.${n2}`);
});

/* ---------- per-verse checks ---------------------------------------------- */
const SCRIPT_FIELDS = [
  ["text", BLOCK.devanagari, "devanagari"],
  ["text_kannada", BLOCK.kannada, "kannada"],
  ["text_telugu", BLOCK.telugu, "telugu"],
  ["translation_kannada", BLOCK.kannada, "kannada"],
  ["translation_telugu", BLOCK.telugu, "telugu"],
];
const ALL_TEXT = [...FIELDS.filter((f) => !["chapter_id", "verse_number"].includes(f))];

/* Speaker formulae, Sanskrit -> the marker each language must carry. */
const SPEAKERS = [
  { san: /धृतराष्ट्र\s*उवाच/, kn: /ಧೃತರಾಷ್ಟ್ರ/, te: /ధృతరాష్ట్ర/, en: /dhritarashtra|dhṛtarāṣṭra|dhritraashtra/i },
  { san: /स(ं|ञ्)जय\s*उवाच/, kn: /ಸಂಜಯ/, te: /సంజయ/, en: /sanjaya|sañjaya/i },
  { san: /अर्जुन\s*उवाच/, kn: /ಅರ್ಜುನ/, te: /అర్జున/, en: /arjuna/i },
  { san: /श्री?भगवानुवाच/, kn: /ಭಗವಂತ|ಭಗವಾನ್|ಕೃಷ್ಣ/, te: /భగవాను|భగవంతు|శ్రీకృష్ణ|కృష్ణ/, en: /blessed lord|lord said|sri bhagavan|the lord|krishna/i },
];

for (const v of verses) {
  const id = `${v.chapter_id}.${v.verse_number}`;

  /* --- A. script and encoding ------------------------------------------- */
  for (const [field, block, name] of SCRIPT_FIELDS) {
    const t = v[field];
    if (typeof t !== "string" || !t) continue;
    if (blockShare(t, block) < 0.9) flag(`A-wrong-script:${field}`, id, `(<90% ${name})`);
  }
  for (const f of ALL_TEXT) {
    const t = v[f];
    if (typeof t !== "string" || !t) continue;
    if (t.normalize("NFC") !== t) flag("A-not-NFC", id, f);
    if (t.includes("�")) flag("A-replacement-char", id, f);
    if (/&(amp|lt|gt|quot|nbsp|#x?[0-9A-Fa-f]+);/.test(t)) flag("A-html-entity", id, f);
    if (t.includes("\r")) flag("F-CR-in-text", id, f);
    if (/ {2,}/.test(t)) flag("F-doubled-space", id, f);
    if (/\n\s*\n/.test(t)) flag("F-blank-line-mid-field", id, f);
    if (t !== t.trim()) flag("F-untrimmed", id, f);
    const zw = (t.match(/[\u200C\u200D]/g) || []).length;
    if (zw) flag("A-zero-width", id, `${f}x${zw}`);
    if (/\S{45,}/.test(t)) flag("F-unwrappable-token", id, f);
  }
  /* Mixed Arabic and Indic digits inside one field. */
  for (const [f, indic] of [["text_kannada", /[೦-೯]/], ["text_telugu", /[౦-౯]/], ["text", /[०-९]/]]) {
    const t = v[f];
    if (typeof t === "string" && indic.test(t) && /[0-9]/.test(t)) flag("A-mixed-digits", id, f);
  }

  /* --- B. orthography ---------------------------------------------------- */
  if (typeof v.text === "string") {
    if (!/[।॥]/.test(v.text)) flag("B-devanagari-no-danda", id);
    /* `।।1.1।।` is this corpus's verse marker: ASCII digits inside Devanagari,
     * consistently, in all 701. Strip it before looking for stray ASCII. */
    const bare = v.text.replace(/।।\d+\.\d+।।\s*$/, "").replace(/[।॥]/g, "");
    if (/[./]/.test(bare)) flag("B-ascii-terminator-in-devanagari", id);
  }
  for (const f of ["text_kannada", "text_telugu"]) {
    const t = v[f];
    if (typeof t !== "string" || !t) continue;
    const hasDanda = /[।॥]/.test(t);
    const hasPipe = /\|/.test(t);
    if (!hasDanda && !hasPipe) flag("B-no-verse-terminator", id, f);
    if (hasDanda && hasPipe) flag("B-mixed-terminators", id, f);
    if (/(?<![\d\s])\.(?!\d)/.test(t)) flag("B-ascii-period-in-verse", id, f);
  }
  /* Avagraha must survive the transliteration of the Devanagari. */
  if (typeof v.text === "string" && v.text.includes("ऽ")) {
    if (typeof v.text_kannada === "string" && !v.text_kannada.includes("ಽ")) flag("B-avagraha-lost", id, "kn");
    if (typeof v.text_telugu === "string" && !v.text_telugu.includes("ఽ")) flag("B-avagraha-lost", id, "te");
  }
  /* Virama correctness in conjuncts is NOT checked here. A word-final virama
   * (रथोत्तमम्, तत्) is ordinary Sanskrit, and telling a legitimate halant from
   * a broken conjunct needs a lexicon, not a regex. Read the verse instead. */

  /* --- C. transliteration ------------------------------------------------ */
  const tr = v.transliteration;
  if (typeof tr === "string" && tr) {
    /* This corpus romanises with the ṛi / ṣh / śh / ch hybrid (Gita-Supersite
      * style), not IAST. Consistent, but not what the field name promises. */
    if (/ṛi|ṣh|śh|ch/.test(tr)) flag("C-not-IAST-hybrid-scheme", id);
    if (/R\^[iI]|~n|\baa\b|(aa|ii|uu)[a-z]/.test(tr)) flag("C-itrans-or-HK-leakage", id);
    if (!/[āīūṛṝḷṃḥśṣṭḍṇñṅ]/.test(tr)) flag("C-no-diacritics", id);
    if (/[A-Z]/.test(tr.replace(/^[A-Z]/, ""))) flag("C-capital-mid-line", id);
  }

  /* --- D proxies: speaker attribution ------------------------------------ */
  for (const sp of SPEAKERS) {
    const inSanskrit = sp.san.test(v.text || "");
    if (!inSanskrit) continue;
    if (!sp.kn.test(v.translation_kannada || "")) flag("D-speaker-missing:kannada", id);
    if (!sp.te.test(v.translation_telugu || "")) flag("D-speaker-missing:telugu", id);
    if (!sp.en.test(v.translation_english || "")) flag("D-speaker-missing:english", id);
    if (typeof v.text_kannada === "string" && !/ಉವಾಚ|ಹೇಳಿದ/.test(v.text_kannada)) flag("D-uvaca-missing:text_kannada", id);
    if (typeof v.text_telugu === "string" && !/ఉవాచ|పలికె|చెప్పె/.test(v.text_telugu)) flag("D-uvaca-missing:text_telugu", id);
  }

  /* --- coverage: a translation that is absent, not merely untranslated ------ */
  for (const f of ["translation_english", "translation_kannada", "translation_telugu", "transliteration", "context_english"]) {
    if (!v[f]) flag(`E-missing:${f}`, id);
  }

  /* --- commentary corruption signatures ---------------------------------- */
  const c = v.commentary_english;
  if (typeof c === "string" && c) {
    /* `?` used where a comma belongs: mid-sentence, next word not capitalised,
     * and the clause it closes is not a question (no leading interrogative). */
    const commaQ = [...c.matchAll(/[a-z,;)"']\s*\?(?=\s+[a-z])/g)].length;
    if (commaQ) flag("A-question-mark-for-comma", id, `x${commaQ}`);
    /* A `?` before a capital: could be a comma too, but nothing in the string
     * distinguishes it from a real question. Left alone, counted here. */
    const ambiguousQ = [...c.matchAll(/[a-z,;)"']\s*\?(?=\s+[A-Z])/g)].length;
    if (ambiguousQ) flag("A-question-mark-ambiguous-left-alone", id, `x${ambiguousQ}`);
    if (/\b(ality|alities|alified|estion|ite|ick|iet|eanimity|eal|eally|acire|acired|acisition|reired|conseence|conseently|freently|tranil|tranillity)\b/.test(c)) flag("A-deleted-qu-residual", id);
      if (blockShare(c, BLOCK.devanagari) > 0.3) flag("A-devanagari-in-commentary_english", id);
    else if (!LATIN.test(c)) flag("A-no-latin-in-commentary_english", id);
  }
}

/* --- D proxy: repeated translation_english blob across adjacent verses ---- */
const byEnglish = new Map();
for (const v of verses) {
  const t = (v.translation_english || "").trim();
  if (t.length < 40) continue;
  if (!byEnglish.has(t)) byEnglish.set(t, []);
  byEnglish.get(t).push(`${v.chapter_id}.${v.verse_number}`);
}
/* One English rendering spanning a verse group, repeated on each id of the
 * group. That is how the source edition presents combined verses; it is a
 * characteristic to declare, not a misalignment to rewrite. */
for (const [, ids] of byEnglish) if (ids.length > 1) flag("E-combined-verse-group-unmarked", ids.join("="));

/* --- D proxy: 9/10 batch seam, Kannada term consistency ------------------ */
const SEAM_TERMS = ["ಸತ್ತ್ವ|ಸಾತ್ತ್ವಿಕ", "ರಜಸ್|ರಾಜಸ", "ತಮಸ್|ತಾಮಸ", "ಯೋಗ", "ಕರ್ಮ", "ಆತ್ಮ", "ಕ್ಷೇತ್ರ", "ಗುಣ"];
const SEAM_FORMULAE = ["ಶ್ರೀಭಗವಂತನು ಹೇಳಿದನು", "ಅರ್ಜುನನು ಹೇಳಿದನು", "ಸಂಜಯನು ಹೇಳಿದನು"];
const side = (lo, hi) => verses.filter((v) => v.chapter_id >= lo && v.chapter_id <= hi).map((v) => v.translation_kannada || "").join("\n");
const before = side(1, 9);
const after = side(10, 18);
for (const term of [...SEAM_TERMS, ...SEAM_FORMULAE]) {
  const a = (before.match(new RegExp(term, "g")) || []).length;
  const b = (after.match(new RegExp(term, "g")) || []).length;
  if ((a === 0) !== (b === 0)) flag("D-seam-term-only-one-side", term, `ch1-9:${a} ch10-18:${b}`);
}
/* Kannada speaker formula variants: more than one spelling of the same formula. */
const knVariants = new Set();
for (const v of verses) {
  const m = (v.translation_kannada || "").match(/^[^ಀ-೿]*([ಀ-೿]+\s*(?:ಹೇಳಿದನು|ಉವಾಚ|ನುಡಿದನು|ಅಂದನು))/);
  if (m) knVariants.add(m[1].trim());
}

/* ---------- report -------------------------------------------------------- */
const BLOCKERS = new Set([
  "E-duplicate-key", "E-verse-gap", "E-chapter-verse-count", "E-field-absent",
  "A-replacement-char", "A-question-mark-for-comma", "A-not-NFC",
  "A-devanagari-in-commentary_english", "A-deleted-qu-residual",
  "E-missing:translation_english", "E-missing:translation_kannada",
  "E-missing:transliteration", "E-missing:context_english",
]);

console.log(`recension: ${RECENSION}`);
console.log(`verses: ${verses.length}`);
console.log("");
const names = [...classes.keys()].sort();
let blocking = 0;
for (const name of names) {
  const hits = classes.get(name);
  if (BLOCKERS.has(name)) blocking += hits.length;
  console.log(`${BLOCKERS.has(name) ? "FAIL" : "warn"}  ${String(hits.length).padStart(5)}  ${name}`);
  if (verbose) console.log(`            ${hits.slice(0, 12).join(", ")}${hits.length > 12 ? ` … +${hits.length - 12}` : ""}`);
}
if (!names.length) console.log("clean");
console.log("");
console.log(`kannada speaker-formula variants (${knVariants.size}): ${[...knVariants].join(" | ")}`);
console.log("");
console.log(`blocking defects: ${blocking}`);
process.exit(blocking ? 1 : 0);
