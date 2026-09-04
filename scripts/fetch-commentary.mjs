#!/usr/bin/env node
// Backfills English commentary into src/data/verses.json from vedicscriptures.github.io
// (free, no key). Preference order picks the fullest public-domain English exposition.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "verses.json");
// `ec` is the English commentary; `et` on the same author is only the translation.
const AUTHORS = ["siva"];
const verses = JSON.parse(readFileSync(SRC, "utf8"));

// `ec` prefixes the prose with the same word glosses we already hold in
// context_english, then runs them together as "...Sanjaya.Commentary Dharma...".
const clean = (s) => {
  const body = s.split(/(?<=[.?!])Commentary\s/)[1] ?? s.replace(/^[\d.]+\s*/, "");
  return body.replace(/\s+/g, " ").trim();
};

const fetchOne = async (v) => {
  const url = `https://vedicscriptures.github.io/slok/${v.chapter_id}/${v.verse_number}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = await res.json();
  for (const a of AUTHORS) {
    const ec = d[a]?.ec;
    if (ec && ec.trim()) return { commentary_english: clean(ec), commentary_author: d[a].author };
  }
  return null;
};

let done = 0, filled = 0, missed = [];
const queue = [...verses];
const worker = async () => {
  for (;;) {
    const v = queue.shift();
    if (!v) return;
    try {
      const got = await fetchOne(v);
      if (got) { Object.assign(v, got); filled++; } else missed.push(`${v.chapter_id}.${v.verse_number}`);
    } catch { missed.push(`${v.chapter_id}.${v.verse_number}`); }
    if (++done % 100 === 0) console.log(`${done}/${verses.length}`);
  }
};
await Promise.all(Array.from({ length: 8 }, worker));

writeFileSync(SRC, `${JSON.stringify(verses, null, 2)}\n`);
console.log(`filled ${filled}/${verses.length}`);
if (missed.length) console.log(`missing: ${missed.join(", ")}`);
