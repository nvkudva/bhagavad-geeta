#!/usr/bin/env node
// Backfills English commentary into src/data/verses.json from vedicscriptures.github.io
// (free, no key). Preference order picks the fullest public-domain English exposition.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "verses.json");
// For Sivananda `ec` is the English commentary (`et` is only his translation); the
// classical commentators carry their English exposition in `et` instead. Sivananda
// prints "No Commentary." for ~70 verses, so fall through to them in that order.
const AUTHORS = [
  ["siva", "ec"],
  ["sankar", "et"],
  ["raman", "et"],
  ["abhinav", "et"],
];
const verses = JSON.parse(readFileSync(SRC, "utf8"));

// `ec` prefixes the prose with the same word glosses we already hold in
// context_english, then runs them together as "...Sanjaya.Commentary Dharma...".
const cleanEc = (s) => {
  const body = s.split(/(?<=[.?!])Commentary\s/)[1];
  return body ? body.replace(/\s+/g, " ").trim() : "";
};

// `et` opens with the verse number, or with the range a block commentary covers.
const cleanEt = (s) => s.replace(/^[\d.]+\s*(-\s*[\d.]+\s*)?/, "").replace(/\s+/g, " ").trim();

// Entries that only say the commentator was silent here, or point at another verse.
const EMPTY = /^(see comment|.{0,80}(did not comment|no commentary|not available))/i;

const fetchOne = async (v) => {
  const url = `https://vedicscriptures.github.io/slok/${v.chapter_id}/${v.verse_number}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = await res.json();
  for (const [a, field] of AUTHORS) {
    const raw = d[a]?.[field];
    if (!raw?.trim()) continue;
    const body = field === "ec" ? cleanEc(raw) : cleanEt(raw);
    if (body && !EMPTY.test(body)) return { commentary_english: body, commentary_author: d[a].author };
  }
  return null;
};

// Only the gaps: the mirror has since degraded (commas served as `?`, `qu`
// deleted from words), and what is already in the corpus has been repaired by
// scripts/data-sources/fix-corpus.mjs. Run that after this to repair the new rows.
let done = 0, filled = 0, missed = [];
const queue = verses.filter((v) => !v.commentary_english);
const worker = async () => {
  for (;;) {
    const v = queue.shift();
    if (!v) return;
    try {
      const got = await fetchOne(v);
      if (got) { Object.assign(v, got); filled++; } else missed.push(`${v.chapter_id}.${v.verse_number}`);
    } catch { missed.push(`${v.chapter_id}.${v.verse_number}`); }
    if (++done % 100 === 0) console.log(`${done}/${queue.length + done}`);
  }
};
await Promise.all(Array.from({ length: 8 }, worker));

writeFileSync(SRC, `${JSON.stringify(verses, null, 2)}\n`);
console.log(`filled ${filled} of ${filled + missed.length} missing`);
if (missed.length) console.log(`missing: ${missed.join(", ")}`);
