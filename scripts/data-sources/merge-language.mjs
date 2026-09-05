#!/usr/bin/env node
/* Merges a per-language translation file into src/data/verses.json.
 *
 * Generalises merge-kannada.mjs and merge-telugu.mjs: same guarantees, but the
 * language, field and provenance string are arguments, so onboarding a new
 * language does not mean another near-identical copy of this file.
 *
 * Idempotent. Refuses to write unless every verse it would touch has text in
 * the right script and no text in a script that must never appear there —
 * a wrong-script merge is silent in the JSON and only shows up as mojibake in
 * the reader, so it is worth failing loudly here.
 *
 * Usage:
 *   node scripts/data-sources/merge-language.mjs \
 *     --input scripts/data-sources/hindi-machine.json \
 *     --field translation_hindi \
 *     --script devanagari \
 *     --source "machine-assisted — rendered from the Sanskrit"
 *
 * Optional:
 *   --min-purity 0.92   fraction of letters that must be in --script (default 0.92)
 *   --against <field>   judge the text against this source field rather than in
 *                       isolation. A run of another script is a defect only when
 *                       it is NOT in the source, and runs carried over verbatim
 *                       are left out of the purity ratio. Commentary needs this:
 *                       it quotes the Upanishads in Devanagari and cites
 *                       "Cf.XVIII.17" in Latin, and a faithful translation keeps
 *                       both. Without it those verses are rejected for being
 *                       correct. Do not use it for a verse translation, where
 *                       the isolated test is the right one.
 *   --min-length 20     shortest acceptable entry (default 20; use 0 for glosses)
 *   --machine-flag      also write <field>_machine: true
 *   --allow-partial     permit verses missing from --input instead of failing
 *   --dry               report and write nothing
 *
 * The input JSON is an object keyed "chapter.verse", e.g. {"1.1": "…", "2.47": "…"}.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const versesPath = join(root, "src", "data", "verses.json");

/** Unicode blocks by name. Add a row to onboard a script. */
const SCRIPTS = {
  devanagari: [0x0900, 0x097f],
  bengali: [0x0980, 0x09ff],
  gurmukhi: [0x0a00, 0x0a7f],
  gujarati: [0x0a80, 0x0aff],
  odia: [0x0b00, 0x0b7f],
  tamil: [0x0b80, 0x0bff],
  telugu: [0x0c00, 0x0c7f],
  kannada: [0x0c80, 0x0cff],
  malayalam: [0x0d00, 0x0d7f],
  sinhala: [0x0d80, 0x0dff],
  latin: [0x0041, 0x024f],
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const inputPath = arg("input");
const field = arg("field");
const scriptName = arg("script");
const source = arg("source");
const minPurity = Number(arg("min-purity", 0.92));
const against = arg("against");
const minLength = Number(arg("min-length", 20));
const machineFlag = arg("machine-flag", false) === true;
const allowPartial = arg("allow-partial", false) === true;
const dry = arg("dry", false) === true;

if (!inputPath || !field || !scriptName || !source) {
  console.error("merge-language: --input, --field, --script and --source are all required");
  process.exit(2);
}
if (!SCRIPTS[scriptName]) {
  console.error(`merge-language: unknown script "${scriptName}". Known: ${Object.keys(SCRIPTS).join(", ")}`);
  process.exit(2);
}

const [lo, hi] = SCRIPTS[scriptName];
const inBlock = (ch, [a, b]) => {
  const c = ch.codePointAt(0);
  return c >= a && c <= b;
};

/* Every Indic block except the target one is a wrong-script signal. Latin is
 * excluded from this check: source texts legitimately carry ASCII punctuation
 * and the occasional digit, which the purity ratio already accounts for. */
const forbidden = Object.entries(SCRIPTS)
  .filter(([name]) => name !== scriptName && name !== "latin")
  .map(([name, range]) => [name, range]);

/* Runs a faithful translation may carry over from its source unchanged: a
 * Devanagari scripture quotation, and a Latin citation or editorial marker.
 * Anything matching these that also appears in the source field is the source's
 * own text, not something the model produced, so it is not evidence about the
 * translation either way. A run that does NOT appear in the source still counts
 * — that is the mojibake and wrong-script merge this guard exists to catch. */
const CARRIED = /[\u0900-\u097f][\u0900-\u097f\s\u0964\u0965]*|[A-Za-z][A-Za-z.\-']*/gu;

function carriedOver(text, sourceText) {
  if (!against || typeof sourceText !== "string") return [];
  return (text.match(CARRIED) ?? [])
    .map((run) => run.trim())
    .filter((run) => run && sourceText.includes(run));
}

/** The text with every carried-over run removed, for judging what the model
  * actually produced. */
function ownWork(text, carried) {
  let out = text;
  for (const run of carried) out = out.split(run).join(" ");
  return out;
}

const verses = JSON.parse(readFileSync(versesPath, "utf8"));
const incoming = JSON.parse(readFileSync(isAbsolute(inputPath) ? inputPath : join(root, inputPath), "utf8"));

const problems = [];
let written = 0;
let skipped = 0;

for (const verse of verses) {
  const id = `${verse.chapter_id}.${verse.verse_number}`;
  const text = incoming[id];

  if (typeof text !== "string" || text.trim().length < minLength) {
    if (allowPartial && text === undefined) { skipped++; continue; }
    problems.push(`${id}: missing or shorter than ${minLength} chars`);
    continue;
  }

  const carried = carriedOver(text, verse[against]);
  const judged = ownWork(text, carried);

  for (const [name, range] of forbidden) {
    if ([...judged].some((ch) => inBlock(ch, range))) problems.push(`${id}: contains ${name}`);
  }

  const letters = [...judged].filter((ch) => /\p{L}/u.test(ch));
  const right = letters.filter((ch) => inBlock(ch, [lo, hi])).length;
  const purity = letters.length ? right / letters.length : 0;
  if (purity < minPurity) {
    problems.push(`${id}: only ${Math.round(purity * 100)}% ${scriptName} (need ${Math.round(minPurity * 100)}%)`);
    continue;
  }

  if (!dry) {
    verse[field] = text.normalize("NFC");
    verse[`${field}_source`] = source;
    if (machineFlag) verse[`${field}_machine`] = true;
  }
  written++;
}

if (problems.length > 0) {
  console.error(`merge-language: ${problems.length} problems:\n${problems.slice(0, 20).join("\n")}`);
  if (problems.length > 20) console.error(`… +${problems.length - 20} more`);
  process.exit(1);
}

if (dry) {
  console.log(`merge-language (dry): ${written} verses would gain ${field}${skipped ? `, ${skipped} absent from input` : ""}`);
} else {
  writeFileSync(versesPath, `${JSON.stringify(verses, null, 2)}\n`);
  console.log(`merge-language: ${written} verses now carry ${field}${skipped ? `, ${skipped} left untouched` : ""}`);
}
