#!/usr/bin/env node
/* Mechanical repairs to src/data/verses.json, one class per block.
 *
 * Every class here is deterministic and re-runnable: running twice is a no-op.
 * Anything that needs judgement (a missing pada, a wrong gloss) is NOT here —
 * it is listed in the audit report and edited by hand.
 *
 *   node scripts/data-sources/fix-corpus.mjs --dry   # report only
 *   node scripts/data-sources/fix-corpus.mjs         # write
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const path = join(root, "src", "data", "verses.json");
const verses = JSON.parse(readFileSync(path, "utf8"));
const dry = process.argv.includes("--dry");

const DEVANAGARI = /[\u0900-\u097F]/;

/* Residue left by the mirror's `qu` deletion -> the word it must be. Anchored:
 * the left-hand side is never itself an English word in this register. */
const QU = [
  [/\bality\b/g, "quality"], [/\balities\b/g, "qualities"],
  [/\balified\b/g, "qualified"], [/\bunalified\b/g, "unqualified"],
  [/\balify\b/g, "qualify"], [/\balifies\b/g, "qualifies"],
  [/\balification\b/g, "qualification"], [/\balifications\b/g, "qualifications"],
  [/\balifiaction\b/g, "qualification"], [/\bdisalified\b/g, "disqualified"],
  [/\bestion\b/g, "question"], [/\bestions\b/g, "questions"],
  [/\bestioning\b/g, "questioning"], [/\bestioned\b/g, "questioned"],
  [/\bite\b/g, "quite"],
  [/\bick\b/g, "quick"], [/\bickly\b/g, "quickly"], [/\bickness\b/g, "quickness"],
  [/\biet\b/g, "quiet"], [/\bietly\b/g, "quietly"], [/\bietude\b/g, "quietude"],
  [/\biescent\b/g, "quiescent"], [/\biescence\b/g, "quiescence"],
  [/\bantity\b/g, "quantity"], [/\bantities\b/g, "quantities"],
  [/\barrel\b/g, "quarrel"], [/\barrels\b/g, "quarrels"], [/\barrelling\b/g, "quarrelling"],
  [/\bench\b/g, "quench"], [/\benched\b/g, "quenched"], [/\benching\b/g, "quenching"],
  [/\best\b/g, "quest"], [/\bote\b/g, "quote"], [/\botes\b/g, "quotes"],
  [/\botation\b/g, "quotation"], [/\botations\b/g, "quotations"],
  [/\bintessence\b/g, "quintessence"],
  [/\beanimity\b/g, "equanimity"], [/\beanimous\b/g, "equanimous"],
  [/\beal\b/g, "equal"], [/\beals\b/g, "equals"], [/\beally\b/g, "equally"],
  [/\beality\b/g, "equality"], [/\beitable\b/g, "equitable"],
  [/\beilibrium\b/g, "equilibrium"], [/\beipped\b/g, "equipped"],
  [/\beipment\b/g, "equipment"], [/\beivalent\b/g, "equivalent"],
  [/\bacire\b/g, "acquire"], [/\bacired\b/g, "acquired"], [/\bacires\b/g, "acquires"],
  [/\baciring\b/g, "acquiring"], [/\bacisition\b/g, "acquisition"],
  [/\bacisitions\b/g, "acquisitions"], [/\bacaintance\b/g, "acquaintance"],
  [/\breire\b/g, "require"], [/\breired\b/g, "required"], [/\breires\b/g, "requires"],
  [/\breirement\b/g, "requirement"], [/\breirements\b/g, "requirements"],
  [/\bconseence\b/g, "consequence"], [/\bconseences\b/g, "consequences"],
  [/\bconseent\b/g, "consequent"], [/\bconseently\b/g, "consequently"],
  [/\bconseential\b/g, "consequential"], [/\bsubseent\b/g, "subsequent"],
  [/\bfreent\b/g, "frequent"], [/\bfreently\b/g, "frequently"],
  [/\btranil\b/g, "tranquil"], [/\btranillity\b/g, "tranquillity"],
  [/\btranility\b/g, "tranquility"], [/\btranilise\b/g, "tranquilise"],
  [/\belont\b/g, "eloquent"], [/\belonce\b/g, "eloquence"],
  [/\binire\b/g, "inquire"], [/\biniry\b/g, "inquiry"], [/\biniries\b/g, "inquiries"],
  [/\benire\b/g, "enquire"], [/\beniry\b/g, "enquiry"],
  [/\badeate\b/g, "adequate"], [/\badeately\b/g, "adequately"],
  [/\badeacy\b/g, "adequacy"], [/\binadeacy\b/g, "inadequacy"],
  [/\beable\b/g, "equable"], [/\bEability\b/g, "Equability"],
  [/\benires\b/g, "enquires"], [/\beniries\b/g, "enquiries"],
  [/\bconer\b/g, "conquer"], [/\bconered\b/g, "conquered"], [/\bconest\b/g, "conquest"],
  [/\bconers\b/g, "conquers"], [/\bconering\b/g, "conquering"],
  [/\bconeror\b/g, "conqueror"], [/\bconerors\b/g, "conquerors"],
  [/\benirer\b/g, "enquirer"], [/\benirers\b/g, "enquirers"],
  [/\balityless\b/g, "qualityless"], [/\btranilminded\b/g, "tranquilminded"],
  [/\bliid\b/g, "liquid"], [/\been\b/g, "queen"], [/\bsare\b/g, "square"],
];
const countDiff = (a, b) => {
  let n = 0;
  for (const [re] of QU) n += (a.match(re) || []).length;
  return n || (a === b ? 0 : 1);
};

/* Edits that needed a reader, not a rule. Each is idempotent, and each is
 * either a script conversion of the verse's own Sanskrit or the restoration of
 * a speaker attribution the Sanskrit carries. Nothing here is composed. */
const HAND = {
  /* Speaker formula present in the Sanskrit (अर्जुन उवाच / सञ्जय उवाच), dropped
   * by the wikisource typist. Wording copied from the corpus's own usage. */
  "1.21": { field: "translation_telugu", when: (t) => !/అర్జునుడు పలికెను/.test(t), to: (t) => `అర్జునుడు పలికెను: ${t}` },
  "2.9": { field: "translation_telugu", when: (t) => !/సంజయుడు పలికెను/.test(t), to: (t) => `సంజయుడు పలికెను: ${t}` },
  /* Wikitext ordered-list number that survived the parse. */
  "13.12": { field: "translation_telugu", when: (t) => /,?\s*20\.\s/.test(t), to: (t) => t.replace(/,?\s*20\.\s*/, " ") },
  /* The field held only a Devanagari fragment. Romanised from this verse's own
   * `text` in the scheme the surrounding verses use (ṛi / śh / ṣh / ch). */
  "11.19": {
    field: "transliteration",
    when: (t) => !t || /[ऀ-ॿ]/.test(t) || t.split("\n").length < 4,
    to: () => "anādi-madhyāntam ananta-vīryam\nananta-bāhuṁ śhaśhi-sūrya-netram\npaśhyāmi tvāṁ dīpta-hutāśha-vaktraṁ\nsva-tejasā viśhvam idaṁ tapantam",
  },
};
/* Commentary that runs straight on from the translation with no bhāṣya heading
 * for the parser to find, so it is cut by the phrase it starts at. The tail is
 * not discarded — it is commentary, and it moves to context_telugu. */
const BLEED = {
  /* "…అనిపించుకాడు" then, with no space at all, a page of commentary. */
  "2.55": { at: "ఇక్కడమనస్సు", tail: (t) => t.replace(/^ఇక్కడమనస్సు/, "ఇక్కడ మనస్సు") },
  /* Ends on a citation of a Brahmam-garu poem, which is not the verse. */
  "15.16": { at: "దీనికి ఉదాహరణ" },
};

/* Verses te.wikisource left absent or unfinished. Composed from the Sanskrit in
 * the register of the verses either side of them, and flagged per-verse so the
 * reader is told these three are not the Wikisource translation. */
const COMPOSED = {
  /* Absent: the page carried only a bhāṣya, which is in context_telugu. */
  "1.13": "అప్పుడు శంఖాలు, భేరులు, పణవాలు, ఆనకాలు, గోముఖాలు ఒక్కసారిగా మోగాయి. ఆ శబ్దం మిక్కిలి భయంకరంగా ఉంది.",
  /* Had only the first of the verse's four clauses. */
  "2.23": "దీనిని శస్త్రాలు ఛేదించలేవు, అగ్ని దహించలేదు, నీరు తడపలేదు, గాలి ఎండించలేదు.",
  /* Had 6 of the 11 qualities; restored in the Sanskrit's own order. */
  "16.2":
    "అహింస, సత్యం, కోపము లేకపోవడం, త్యాగం, శాంతి, చాడీలు చెప్పకపోవడం, ప్రాణులయందు దయ, లోభం లేకపోవడం, మృదుస్వభావం, సిగ్గు, చాపల్యం లేకపోవడం.",
};

/* Two `qu`-deleted words the mechanical table cannot reach: the residue is not
 * a clean stem, so the target is read off the sentence rather than the rule. */
const HAND_WORDS = [
  [/\bproper eivalen\b/g, "proper equivalent"],
  [/\buniversity alitifactions\b/g, "university qualifications"],
];

const counts = {};
const bump = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };
const notes = [];

/** A commentary_english that is really a Devanagari word-gloss list, not prose.
 *  Every one of these duplicates context_english, which already holds the gloss. */
const isGlossList = (c) => (c.match(/[ऀ-ॿ]+\s+[A-Za-z]/g) || []).length >= 5;

/** The te.wikisource bhāṣya block, which belongs in context_telugu. */
const BHASYA = /(ఆదిశంకరాచార్యులవారు\s*:|రామానుజాచార్యులవారు\s*:|మధ్వాచార్యులవారు\s*:)/;

for (const v of verses) {
  const id = `${v.chapter_id}.${v.verse_number}`;

  /* 1. commentary_english that is a word-gloss list, not commentary. */
  if (typeof v.commentary_english === "string" && isGlossList(v.commentary_english)) {
    v.commentary_english = null;
    bump("commentary-gloss-list-nulled");
  }

  /* 2. `?` standing in for a comma: mid-sentence, followed by a lowercase word.
   *    A real question mark is followed by end-of-string or a capital. */
  if (typeof v.commentary_english === "string") {
    const before = v.commentary_english;
    v.commentary_english = before.replace(/([^\s?!.])\s*\?(\s+)(?=[a-z])/g, "$1,$2");
    const n = (before.match(/([^\s?!.])\s*\?(\s+)(?=[a-z])/g) || []).length;
    if (n) bump("question-mark-for-comma", n);
    /* 3. The corpus-wide `qu` deletion. Every entry below is anchored so the
     *    residue it matches is not itself an English word — no guessing. */
    const q = v.commentary_english;
    let t = q;
    for (const [re, to] of QU) t = t.replace(re, to);
    if (t !== q) bump("deleted-qu-restored", countDiff(q, t));
    v.commentary_english = t;
  }

  /* 4. Telugu bhāṣya that bled into the translation field. Head stays as the
   *    translation, tail moves to context_telugu where the commentary belongs. */
  if (typeof v.translation_telugu === "string" && BHASYA.test(v.translation_telugu)) {
    const at = v.translation_telugu.search(BHASYA);
    const head = v.translation_telugu.slice(0, at).trim();
    const tail = v.translation_telugu.slice(at).trim();
    const existing = (v.context_telugu || "").trim();
    v.context_telugu = existing ? `${existing}\n${tail}` : tail;
    if (head) {
      v.translation_telugu = head;
      bump("telugu-bhasya-unbled");
    } else {
      v.translation_telugu = null;
      bump("telugu-translation-was-only-bhasya");
      notes.push(`${id}: translation_telugu held only bhāṣya; nulled, bhāṣya moved to context_telugu`);
    }
  }

  /* 5. Leading `: ` left by the wikitext section parser. */
  for (const f of ["context_telugu", "context_kannada", "translation_telugu"]) {
    if (typeof v[f] === "string" && /^\s*:\s/.test(v[f])) {
      v[f] = v[f].replace(/^\s*:\s*/, "");
      bump("leading-colon-stripped");
    }
  }

  /* 6. Leading `- ` left on the English of a combined-verse group. */
  if (typeof v.translation_english === "string" && /^\s*-\s+/.test(v.translation_english)) {
    v.translation_english = v.translation_english.replace(/^\s*-\s+/, "");
    bump("leading-dash-stripped");
  }

  /* 6b. The closing marker of the Devanagari verse is `।।C.V।।`, both dandas. */
  if (typeof v.text === "string" && /।।\d+\.\d+।$/.test(v.text.trim())) {
    v.text = `${v.text.trim()}।`;
    bump("verse-marker-danda-restored");
  }

  /* 6c. A Devanagari line that leaked into the romanisation field. */
  if (typeof v.transliteration === "string" && /[ऀ-ॿ]/.test(v.transliteration)) {
    const kept = v.transliteration.split("\n").filter((l) => !/[ऀ-ॿ]/.test(l)).join("\n").trim();
    if (kept) { v.transliteration = kept; bump("devanagari-line-dropped-from-transliteration"); }
  }

  /* 7. Blank line mid-verse: padas separate with a single \n, never \n\n. */
  for (const f of ["text", "text_kannada", "text_telugu", "transliteration"]) {
    if (typeof v[f] === "string" && /\n\s*\n/.test(v[f])) {
      v[f] = v[f].replace(/\n\s*\n+/g, "\n");
      bump("blank-line-collapsed");
    }
  }

  /* 8. Doubled spaces, stray \r, untrimmed edges, NFC. */
  for (const [f, val] of Object.entries(v)) {
    if (typeof val !== "string") continue;
    let t = val.replace(/\r\n?/g, "\n").replace(/[^\S\n]{2,}/g, " ").normalize("NFC");
    t = t.split("\n").map((l) => l.trim()).join("\n").trim();
    if (t !== val) { v[f] = t; bump("whitespace-normalised"); }
  }

  /* 9. Empty string is not "not translated" — the UI cannot tell them apart. */
  for (const f of ["context_kannada", "context_telugu", "commentary_english", "translation_telugu", "translation_kannada"]) {
    if (v[f] === "") { v[f] = null; bump("empty-string-to-null"); }
  }
}

for (const v of verses) {
  const id = `${v.chapter_id}.${v.verse_number}`;
  const h = HAND[id];
  if (h && typeof v[h.field] !== "undefined" && h.when(v[h.field] || "")) {
    v[h.field] = h.to(v[h.field] || "");
    bump("hand-edit");
    notes.push(`${id}: hand edit to ${h.field}`);
  }
  const bleed = BLEED[id];
  if (bleed && typeof v.translation_telugu === "string" && v.translation_telugu.includes(bleed.at)) {
    const cut = v.translation_telugu.indexOf(bleed.at);
    const kept = v.translation_telugu.slice(0, cut).trim();
    const raw = v.translation_telugu.slice(cut).trim();
    v.translation_telugu = /[.?!]$/.test(kept) ? kept : `${kept}.`;
    const moved = bleed.tail ? bleed.tail(raw) : raw;
    v.context_telugu = v.context_telugu ? `${moved} ${v.context_telugu}` : moved;
    bump("telugu-commentary-bleed-moved");
    notes.push(`${id}: commentary split out of translation_telugu into context_telugu`);
  }

  const composed = COMPOSED[id];
  if (composed && v.translation_telugu !== composed) {
    v.translation_telugu = composed;
    v.translation_telugu_machine = true;
    bump("telugu-composed");
    notes.push(`${id}: translation_telugu composed (machine-assisted)`);
  }

  /* The residue of the word-gloss import: 70 commentary_english fields that held
   * nothing but a Devanagari gloss list were nulled in an earlier pass. Two more had
   * the gloss list pasted in FRONT of real prose, with the literal word "Commentary"
   * separating the two — 1.15 (where nothing but "No Commentary." follows) and 10.7.
   *
   * The discriminator is deliberately narrow. Eight other verses carry Devanagari
   * inside commentary_english and MUST be left alone: 13.21, 13.31, 15.6, 15.7, 15.9,
   * 15.14, 17.8, 17.15 all quote the Upanishads, the Manu Smriti or a Sanskrit term in
   * its own script, in the middle of real English prose. That is a citation, not a
   * defect. None of them contains the word "Commentary", which is why this rule keys
   * on it rather than on the presence of Devanagari. */
  if (typeof v.commentary_english === "string" && DEVANAGARI.test(v.commentary_english)) {
    const split = /\bCommentary\b/.exec(v.commentary_english);
    if (split && DEVANAGARI.test(v.commentary_english.slice(0, split.index))) {
      const rest = v.commentary_english.slice(split.index + "Commentary".length).replace(/^[\s.:?—-]+/, "").trim();
      if (rest.length < 40) {
        // 1.15: the whole field was the gloss list, tailed by "No Commentary."
        // null, not delete: the 70 nulled by the earlier pass are null, and
        // check-corpus.mjs treats an absent key as a blocking defect.
        v.commentary_english = null;
        bump("devanagari-gloss-nulled");
        notes.push(`${id}: commentary_english was a Devanagari gloss list, nulled (context_english already carries the glosses)`);
      } else {
        v.commentary_english = rest;
        bump("devanagari-gloss-header-stripped");
        notes.push(`${id}: leading Devanagari gloss run stripped from commentary_english`);
      }
    }
  }

  if (typeof v.commentary_english === "string") {
    for (const [re, to] of HAND_WORDS) {
      if (re.test(v.commentary_english)) { v.commentary_english = v.commentary_english.replace(re, to); bump("hand-edit-word"); }
    }
  }
}

console.log(Object.entries(counts).map(([k, n]) => `${String(n).padStart(5)}  ${k}`).join("\n") || "nothing to fix");
for (const n of notes) console.log(`note: ${n}`);
if (!dry) {
  writeFileSync(path, `${JSON.stringify(verses, null, 2)}\n`);
  console.log("\nwritten:", path);
}
