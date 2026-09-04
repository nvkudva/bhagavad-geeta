#!/usr/bin/env node
/* Fetches the Telugu translation of all 701 verses from te.wikisource.org.
 *
 * Source: "భగవద్గీత - తెలుగు అనువాదము", eighteen chapter pages, CC BY-SA 4.0.
 * Each page is a flat list of `===pratīka===` sections, one per verse, in verse
 * order. A section body is the Sanskrit śloka in Telugu script, terminated by a
 * `|| c-v ||` marker, followed by the Telugu prose translation. Some chapters
 * omit the śloka and the marker entirely and carry only the prose.
 *
 * Writes scripts/data-sources/telugu-wikisource.json:
 *   { "<chapter>.<verse>": { pratika, translation_telugu, commentary_telugu } }
 *
 * Wikimedia 403s a request with no User-Agent. Be polite: one request per
 * chapter, serially, with a pause between.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const UA = "bhagavad-geeta-app/1.0 (https://github.com/; data import; contact via repo)";

/** Chapter number -> te.wikisource page title, and the verse count we expect. */
const CHAPTERS = [
  ["అర్జునవిషాద యోగము", 47],
  ["సాంఖ్య యోగము", 72],
  ["కర్మ యోగము", 43],
  ["జ్ఞాన యోగము", 42],
  ["కర్మసన్యాస యోగము", 29],
  ["ఆత్మసంయమ యోగము", 47],
  ["జ్ఞానవిజ్ఞాన యోగము", 30],
  ["అక్షరపరబ్రహ్మ యోగము", 28],
  ["రాజవిద్యారాజగుహ్య యోగము", 34],
  ["విభూతి యోగము", 42],
  ["విశ్వరూపసందర్శన యోగము", 55],
  ["భక్తి యోగము", 20],
  ["క్షేత్రక్షేత్రజ్ఞవిభాగ యోగము", 35],
  ["గుణత్రయవిభాగ యోగము", 27],
  ["పురుషోత్తమప్రాప్తి యోగము", 20],
  ["దైవాసురసంపద్విభాగ యోగము", 24],
  ["శ్రద్దాత్రయవిభాగ యోగము", 28],
  ["మోక్షసన్యాస యోగము", 78],
];

const raw = async (title) => {
  const url = `https://te.wikisource.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${title}: HTTP ${res.status}`);
  return res.text();
};

/** Wiki markup that is not the verse: templates, links, comments, formatting. */
const stripMarkup = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/ /g, " ");

/* The śloka is closed by a `|| 2-47 ||` marker. The source is hand-typed and
   inconsistent about it: some verses drop a pipe (`|| 16-4 |`), some drop the
   reference (`||`), and some open with a plain verse number instead. Three
   patterns, tried in order of how certain each one is. */
const MARKER_REF = /\|\|\s*\d+\s*[-–]\s*\d+\s*\|{1,2}/g;
const MARKER_BARE = /\|\|/g;
/** A leading "15." left behind once the śloka is cut. */
const LEADING_NUMBER = /^\s*\d+\s*[.।|]\s*/;
/** The chapter colophon — "ఓం తత్సదితి శ్రీమద్భగవద్గీతాసూపనిషత్సు…" — is appended to
 *  the last verse of a chapter. It closes the chapter, it does not translate
 *  the verse. */
const COLOPHON = /ఓం\s*తత్సదితి[\s\S]*$/;

/** Everything from the bhāṣya heading on is commentary, not translation. */
const COMMENTARY_AT = /(భాష్యాలు|భాష్యములు)/;

const sectionsOf = (wikitext) => {
  const out = [];
  // `===heading===` at the start of a line. Deeper levels (====) are commentary
  // subheadings inside a verse, so only three equals signs open a verse.
  const re = /^===([^=][^\n]*?)===\s*$/gm;
  let match;
  const marks = [];
  while ((match = re.exec(wikitext)) !== null) marks.push({ title: match[1].trim(), start: match.index, end: re.lastIndex });
  for (let i = 0; i < marks.length; i += 1) {
    const body = wikitext.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : undefined);
    out.push({ title: marks[i].title, body });
  }
  return out;
};

const clean = (s) => s.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).join(" ").trim();

function parseSection(body) {
  const text = stripMarkup(body);
  const cut = text.search(COMMENTARY_AT);
  const versePart = cut === -1 ? text : text.slice(0, cut);
  const commentaryPart = cut === -1 ? "" : text.slice(cut).replace(COMMENTARY_AT, "");

  // The translation is whatever follows the last verse marker. Without any
  // marker the page carries no śloka and the whole body is the translation.
  const after = (part, re) => {
    re.lastIndex = 0;
    let end = -1;
    let m;
    while ((m = re.exec(part)) !== null) end = m.index + m[0].length;
    return end === -1 ? null : part.slice(end);
  };

  const translation = after(versePart, MARKER_REF) ?? after(versePart, MARKER_BARE) ?? versePart;

  return {
    translation_telugu: clean(translation)
      .replace(LEADING_NUMBER, "")
      .replace(/^[|।॥\s]+/, "")
      .replace(COLOPHON, "")
      // A lone pipe inside the prose is a missing space in the source.
      .replace(/\s*\|\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim(),
    commentary_telugu: clean(commentaryPart),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const out = {};
  const problems = [];

  for (let i = 0; i < CHAPTERS.length; i += 1) {
    const [title, expected] = CHAPTERS[i];
    const chapter = i + 1;
    const wikitext = await raw(title);
    const sections = sectionsOf(wikitext);

    if (sections.length !== expected) problems.push(`chapter ${chapter} (${title}): ${sections.length} sections, expected ${expected}`);

    sections.forEach((section, index) => {
      const verse = index + 1;
      const parsed = parseSection(section.body);
      if (!parsed.translation_telugu) problems.push(`chapter ${chapter} verse ${verse}: empty translation`);
      out[`${chapter}.${verse}`] = { pratika: section.title, ...parsed };
    });

    process.stderr.write(`chapter ${chapter}: ${sections.length}/${expected}\n`);
    await sleep(400);
  }

  writeFileSync(join(here, "telugu-wikisource.json"), `${JSON.stringify(out, null, 1)}\n`);
  process.stderr.write(`\n${Object.keys(out).length} verses written\n`);
  if (problems.length > 0) {
    process.stderr.write(`\n${problems.length} problems:\n${problems.join("\n")}\n`);
    process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
