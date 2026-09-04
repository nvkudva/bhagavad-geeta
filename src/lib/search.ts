// Local, offline verse search. The whole searchable corpus is one build-time
// index (scripts/build-data.mjs) — 728 KB raw, ~220 KB over the wire, fetched
// once on first search and then served by the CacheFirst /data/v1/ rule.
// Commentary is not indexed: it is 75% of the corpus and matching it surfaces
// the essay rather than the verse.
import type { ChapterId } from "./gita.types";

/** [chapter, verse, devanagari, kannada, telugu, transliteration, english] */
type Row = [number, number, string, string, string, string, string];

export interface SearchHit {
  chapter: ChapterId;
  verse: number;
  /** The field the match came from, already trimmed to a snippet around it. */
  snippet: string;
  snippetLang: "sa" | "kn" | "te" | "sa-Latn" | "en";
  /** Character range of the match inside `snippet`, for highlighting. */
  match: [start: number, end: number] | null;
  score: number;
}

/** Diacritic- and case-insensitive: "krsna", "kṛṣṇa" and "Krishna" must not be
 *  three different queries. Indic scripts are left alone — NFD there separates
 *  vowel signs that are part of the letter, not accents on it. */
export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

let cache: readonly Row[] | null = null;
let inflight: Promise<readonly Row[]> | null = null;

export function peekIndex(): readonly Row[] | null {
  return cache;
}

export function loadIndex(): Promise<readonly Row[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = fetch(`${import.meta.env.BASE_URL}data/v1/search-index.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load search index: ${res.status}`);
      return res.json() as Promise<{ rows: Row[] }>;
    })
    .then((data) => {
      cache = data.rows;
      return cache;
    })
    .catch((err: unknown) => {
      inflight = null;
      throw err;
    });

  return inflight;
}

/* --------------------------------------------------------------- reference */

/** "2.47", "2:47", "2 47", "ch 2 v 47" — a citation, not a phrase. */
export function parseReference(query: string): { chapter: number; verse: number } | null {
  const m = /^(?:ch(?:apter)?\s*)?(\d{1,2})\s*(?:[.:\-/]|\s|v(?:erse)?\s*)\s*(\d{1,3})$/i.exec(query.trim());
  if (!m) return null;
  const chapter = Number(m[1]);
  const verse = Number(m[2]);
  if (chapter < 1 || chapter > 18 || verse < 1) return null;
  return { chapter, verse };
}

/* ------------------------------------------------------------------ search */

const SNIPPET_RADIUS = 90;

/** A window around the match, cut on word boundaries where the script has them. */
function snippetAround(text: string, at: number, length: number): { snippet: string; match: [number, number] } {
  if (text.length <= SNIPPET_RADIUS * 2) return { snippet: text, match: [at, at + length] };

  let start = Math.max(0, at - SNIPPET_RADIUS);
  let end = Math.min(text.length, at + length + SNIPPET_RADIUS);
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < at) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space !== -1 && space > at + length) end = space;
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return { snippet: prefix + text.slice(start, end) + suffix, match: [at - start + prefix.length, at - start + prefix.length + length] };
}

/** The index is normalized lazily and kept, so typing another character does not
 *  re-normalize 701 rows × 5 fields. */
const normalized = new WeakMap<Row, readonly string[]>();
const normalizeRow = (row: Row): readonly string[] => {
  let fields = normalized.get(row);
  if (!fields) {
    fields = [normalize(row[2]), normalize(row[3]), normalize(row[4]), normalize(row[5]), normalize(row[6])];
    normalized.set(row, fields);
  }
  return fields;
};

// Field order inside a row after the two ids, paired with its display language
// and a weight: an English or transliteration hit is what a typed query usually
// means, a raw-script hit is what a pasted line means.
const FIELDS: readonly { offset: 2 | 3 | 4 | 5 | 6; lang: SearchHit["snippetLang"]; weight: number }[] = [
  { offset: 6, lang: "en", weight: 100 },
  { offset: 5, lang: "sa-Latn", weight: 80 },
  { offset: 2, lang: "sa", weight: 70 },
  { offset: 3, lang: "kn", weight: 70 },
  { offset: 4, lang: "te", weight: 70 },
];

export function search(rows: readonly Row[], query: string, limit = 60): SearchHit[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  const hits: SearchHit[] = [];

  for (const row of rows) {
    const fields = normalizeRow(row);
    let best: SearchHit | null = null;

    for (const { offset, lang, weight } of FIELDS) {
      const haystack = fields[offset - 2];
      if (!haystack) continue;
      const at = haystack.indexOf(q);
      if (at === -1) continue;

      // A hit at a word start beats one mid-word, and a short field means the
      // match is a bigger share of it.
      const wordStart = at === 0 || haystack[at - 1] === " ";
      const score = weight + (wordStart ? 25 : 0) + Math.round((q.length / haystack.length) * 40);
      if (best && best.score >= score) continue;

      // The normalized string is index-aligned with the raw one: normalize only
      // lowercases, drops combining marks and collapses runs of whitespace, so
      // offsets drift only where the raw text had double spaces. Close enough
      // for a highlight, and snippetAround re-clamps.
      const raw = row[offset];
      const { snippet, match } = snippetAround(raw, Math.min(at, Math.max(0, raw.length - q.length)), q.length);
      best = { chapter: row[0], verse: row[1], snippet, snippetLang: lang, match, score };
    }

    if (best) hits.push(best);
  }

  hits.sort((a, b) => b.score - a.score || a.chapter - b.chapter || a.verse - b.verse);
  return hits.slice(0, limit);
}
