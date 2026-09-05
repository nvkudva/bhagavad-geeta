#!/usr/bin/env node
/* Reports how complete each per-language field is, and which verses are missing.
 *
 * manifest.json carries the same counts, but only after a build — this reads
 * src/data/verses.json directly so it is true of the working tree, which is
 * what you want before deciding what to translate next.
 *
 * Usage:
 *   node scripts/data-sources/coverage.mjs             # every field
 *   node scripts/data-sources/coverage.mjs --gaps      # only incomplete ones
 *   node scripts/data-sources/coverage.mjs --lang kn   # one language
 *   node scripts/data-sources/coverage.mjs --field context_kannada --ids
 *
 * --ids prints the missing verse ids, which is what you feed a translation run.
 * With --json it emits {field: [ids…]} for scripting.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const verses = JSON.parse(readFileSync(join(root, "src", "data", "verses.json"), "utf8"));

const flag = (n) => process.argv.includes(`--${n}`);
const opt = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

/** Which language each field suffix belongs to. "" = language-neutral. */
const LANGS = { _kannada: "kn", _telugu: "te", _english: "en", _hindi: "hi", _tamil: "ta" };
const langOf = (field) => {
  const hit = Object.keys(LANGS).find((s) => field.endsWith(s));
  return hit ? LANGS[hit] : "—";
};

/* Provenance and flag fields describe other fields rather than holding text, so
 * counting them as coverage would be misleading. */
const isMeta = (f) => f.endsWith("_source") || f.endsWith("_machine");
const SKIP = new Set(["chapter_id", "verse_number"]);

const fields = [...new Set(verses.flatMap((v) => Object.keys(v)))]
  .filter((f) => !SKIP.has(f) && !isMeta(f))
  .sort();

const onlyLang = opt("lang");
const onlyField = opt("field");
const total = verses.length;

const rows = [];
const missingByField = {};

for (const field of fields) {
  if (onlyField && field !== onlyField) continue;
  const lang = langOf(field);
  if (onlyLang && lang !== onlyLang) continue;

  const missing = verses
    .filter((v) => {
      const x = v[field];
      return typeof x !== "string" || !x.trim();
    })
    .map((v) => `${v.chapter_id}.${v.verse_number}`);

  missingByField[field] = missing;
  const have = total - missing.length;
  if (flag("gaps") && missing.length === 0) continue;

  rows.push({ field, lang, have, missing: missing.length, chars: verses.reduce((s, v) => s + (typeof v[field] === "string" ? v[field].length : 0), 0) });
}

if (flag("json")) {
  console.log(JSON.stringify(missingByField, null, 2));
  process.exit(0);
}

if (rows.length === 0) {
  console.log("nothing matched");
  process.exit(0);
}

const w = Math.max(...rows.map((r) => r.field.length));
console.log(`${"field".padEnd(w)}  lang  present  missing   source chars`);
console.log("-".repeat(w + 34));
for (const r of rows) {
  const bar = r.missing === 0 ? "complete" : `${r.missing} missing`;
  console.log(
    `${r.field.padEnd(w)}  ${r.lang.padEnd(4)}  ${String(r.have).padStart(7)}  ${String(r.missing).padStart(7)}   ${String(r.chars).padStart(9)}  ${r.missing === 0 ? "" : bar}`,
  );
}

if (flag("ids")) {
  console.log("");
  for (const [field, ids] of Object.entries(missingByField)) {
    if (!ids.length) continue;
    if (onlyField && field !== onlyField) continue;
    console.log(`${field} missing ${ids.length}: ${ids.slice(0, 40).join(", ")}${ids.length > 40 ? ` … +${ids.length - 40}` : ""}`);
  }
}

/* A field that exists on some verses but not others is the actionable case:
 * either it was never finished, or a merge silently dropped rows. */
const partial = rows.filter((r) => r.missing > 0 && r.have > 0);
if (partial.length && !flag("gaps")) {
  console.log(`\n${partial.length} partial field(s): ${partial.map((r) => `${r.field} (${r.have}/${total})`).join(", ")}`);
}
