// Subsets the three Indic faces to the codepoints the corpus actually uses.
// Google's CSS API does the subsetting server-side, which means it runs the
// same layout closure Google ships to production — conjuncts and matras
// survive without a local fonttools install.
//
//   node scripts/subset-fonts.mjs          # rewrite public/fonts + print @font-face
//
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Weight 600 is here because .verse-tab, .chapter-badge, .chapter-stats and
// .verse-of-moment-label render an Indic label at semibold; without a real
// 600 face the browser synthesises one and smears the conjuncts.
// `blocks` mirrors the unicode-range each face carried before subsetting, so a
// danda or a vedic accent keeps being drawn by the face that used to draw it.
const FACES = [
  {
    file: "noto-sans-devanagari",
    family: "Noto Sans Devanagari",
    blocks: [[0x0900, 0x097f], [0x1cd0, 0x1cf9], [0x200c, 0x200d], [0x20a8, 0x20a8], [0x20b9, 0x20b9], [0x20f0, 0x20f0], [0x25cc, 0x25cc], [0xa830, 0xa839], [0xa8e0, 0xa8ff]],
  },
  {
    file: "noto-sans-kannada",
    family: "Noto Sans Kannada",
    blocks: [[0x0951, 0x0952], [0x0964, 0x0965], [0x0c80, 0x0cf3], [0x1cd0, 0x1cd0], [0x1cd2, 0x1cd3], [0x1cda, 0x1cda], [0x1cf2, 0x1cf2], [0x1cf4, 0x1cf4], [0x200c, 0x200d], [0x20b9, 0x20b9], [0x25cc, 0x25cc], [0xa830, 0xa835]],
  },
  {
    file: "noto-sans-telugu",
    family: "Noto Sans Telugu",
    blocks: [[0x0951, 0x0952], [0x0964, 0x0965], [0x0c00, 0x0c7f], [0x1cda, 0x1cda], [0x1cf2, 0x1cf2], [0x200c, 0x200d], [0x25cc, 0x25cc]],
  },
];
const WEIGHTS = [400, 600];
// ZWNJ, ZWJ and the dotted circle: the first two drive conjunct formation, and
// the third is what a failed subset renders as — keeping it makes the failure
// visible instead of silent.
const ALWAYS = ["‌", "‍", "◌"];

// The components carry Indic UI strings of their own — nav labels, the search
// placeholder, the language switcher — and a subset built from the corpus alone
// would drop them straight through to whatever the OS has installed.
const sources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "data" ? [] : sources(full);
    return /\.tsx?$/.test(e.name) ? [fs.readFileSync(full, "utf8")] : [];
  });

const corpus = [
  ...["src/data/verses.json", "src/data/chapters.json"].map((f) =>
    JSON.parse(fs.readFileSync(path.join(root, f), "utf8")),
  ),
  ...sources(path.join(root, "src")),
  ...[fs.readFileSync(path.join(root, "index.html"), "utf8")],
];

const collect = (blocks) => {
  const found = new Set(ALWAYS);
  const walk = (node) => {
    if (typeof node === "string") {
      for (const ch of node) {
        const cp = ch.codePointAt(0);
        if (blocks.some(([lo, hi]) => cp >= lo && cp <= hi)) found.add(ch);
      }
    } else if (node && typeof node === "object") Object.values(node).forEach(walk);
  };
  corpus.forEach(walk);
  return [...found].sort();
};

// One range per run of adjacent codepoints, so the browser falls through to the
// system face for anything the subset does not carry rather than drawing tofu.
const unicodeRange = (chars) => {
  const cps = chars.map((c) => c.codePointAt(0)).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cps.length; i++) {
    const start = cps[i];
    while (i + 1 < cps.length && cps[i + 1] === cps[i] + 1) i++;
    const hex = (n) => "U+" + n.toString(16).toUpperCase().padStart(4, "0");
    out.push(start === cps[i] ? hex(start) : `${hex(start)}-${hex(cps[i])}`);
  }
  return out.join(", ");
};

const get = async (url, asText) => {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
};

let css = "";
for (const face of FACES) {
  const chars = collect(face.blocks);
  const range = unicodeRange(chars);
  for (const weight of WEIGHTS) {
    const name = weight === 400 ? face.file : `${face.file}-${weight}`;
    const api =
      `https://fonts.googleapis.com/css2?family=${face.family.replace(/ /g, "+")}` +
      `:wght@${weight}&text=${encodeURIComponent(chars.join(""))}`;
    const sheet = await get(api, true);
    const url = sheet.match(/url\((https:[^)]+)\)/);
    if (!url) throw new Error(`no woff2 in Google's reply for ${face.family} ${weight}`);
    const buf = await get(url[1], false);
    const dest = path.join(root, "public/fonts", `${name}.woff2`);
    const before = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    fs.writeFileSync(dest, buf);
    console.log(
      `${name.padEnd(28)} ${chars.length} cp  ${String(before).padStart(7)} -> ${String(buf.length).padStart(6)} B`,
    );
    css +=
      `@font-face {\n  font-family: "${face.family}";\n  font-style: normal;\n` +
      `  font-weight: ${weight};\n  font-display: swap;\n` +
      `  src: url("/fonts/${name}.woff2") format("woff2");\n  unicode-range: ${range};\n}\n`;
  }
}
console.log("\n" + css);
