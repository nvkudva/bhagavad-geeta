#!/usr/bin/env node
// Size budget gate for the gzip rows in docs/ARCHITECTURE_PLAN.md §6.5.
// Fails the build if the corpus (or anything else) creeps back into the shell.
import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "dist", "assets");

if (!existsSync(assets)) {
  console.error("check-size: dist/assets not found — run the build first.");
  process.exit(1);
}

const KB = 1024;
// Raised from 65/3 KB when the DESIGN_PLAN P0 block landed:
//   JS  +0.9 KB — the bottom tab bar, three routed placeholder screens, four more
//                 lucide icons, and the react-vendor/app chunk split (§P2.2), which
//                 trades ~1 KB of gzip for a react chunk that survives app deploys.
//   CSS +2.0 KB — the §2.3 token set, the §2.4 base rules, the app-nav/main/tabbar
//                 shell, and seven self-hosted @font-face blocks with unicode-range.
// Raised from 70/6 KB when search, saved verses and the home verse card landed:
//   JS  +1.0 KB — the search screen and its scorer, the bookmarks store, the saved
//                 list and the home verse card, plus five more lucide icons. The
//                 728 KB search index is fetched on first search, not bundled.
//   CSS +1.0 KB — the search field and result rows, the saved list, and the
//                 verse-for-you card.
// Raised from 71/7 KB when the desktop layout and the gradient sloka landed:
//   CSS +1.0 KB — the min-width:1024px sidebar/type block, the accent glow on the
//                 verse-for-you card, and the gilded/silver text ramps, each of
//                 which needs a light-appearance and a prefers-contrast variant.
// Raised from 71/8 KB when the desktop pass landed (main was already over both
// rows at 71.6/8.7 before it):
//   JS  +4.0 KB — the useWide/useWidePlus media store, the keyboard layer, the
//                 command palette and the shortcuts sheet, the verse rail and
//                 the continuous-scroll reader branch, plus six more lucide icons.
//                 All of it is desktop-only behaviour but it ships in the shell:
//                 splitting it would cost a chunk request on every wide load.
//   CSS +3.0 KB — the 900px and 1280px blocks, the pointer-only hover/tooltip
//                 block, and the light-appearance overrides each of those needs.
// Raised from 76/12 KB when the chapter list learned Kannada and Telugu:
//   JS  +4.0 KB — chapters.json carries the name, the name's meaning and the
//                 summary in three languages now, and it is imported into the
//                 shell rather than fetched, because the chapter grid IS the
//                 home screen and must paint with it. Splitting the two Indic
//                 sets into a lazy chunk would trade 4 KB for a fetch on the
//                 first screen, which is the wrong way round.
// Split from one 12 KB css row into two when the >=900px tiers moved to
// src/desktop.css, loaded behind media="(min-width: 900px)":
//   css     — render-blocking on every device. This is the number that matters:
//             it went 11.6 -> 8.2 KB gz on the split. Budget 9 KB.
//   desktop — fetched at low priority, never render-blocking on a phone. 6 KB.
// A single summed row would have let a desktop-only block eat the mobile
// critical path's headroom, which is exactly what the split exists to prevent.
// Raised from 81 KB when the service worker learned to ask before it updates:
//   JS  +1.0 KB — src/lib/sw.ts (registration, the hourly/visibility check, and
//                 the SKIP_WAITING handshake), the update toast, and the
//                 Settings row that forces the check. Hand-rolled rather than
//                 virtual:pwa-register, which would have cost 2.4 KB gz of
//                 workbox-window for the same handshake.
const BUDGETS = { js: 82 * KB, css: 9 * KB, desktopCss: 6 * KB };

const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const files = readdirSync(assets);

let jsBytes = 0;
let cssBytes = 0;
let desktopCssBytes = 0;
for (const f of files) {
  const size = gz(join(assets, f));
  if (f.endsWith(".js")) jsBytes += size;
  else if (f.startsWith("desktop-") && f.endsWith(".css")) desktopCssBytes += size;
  else if (f.endsWith(".css")) cssBytes += size;
}

const rows = [
  ["initial JS (gzip)", jsBytes, BUDGETS.js],
  ["render-blocking CSS (gzip)", cssBytes, BUDGETS.css],
  ["desktop CSS (gzip, >=900px only)", desktopCssBytes, BUDGETS.desktopCss],
];

let failed = false;
for (const [label, actual, budget] of rows) {
  const ok = actual <= budget;
  if (!ok) failed = true;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${(actual / KB).toFixed(1)} KB / ${(budget / KB).toFixed(0)} KB`);
}

/* Token discipline. Every colour belongs in a token block; a literal anywhere else
   is a value that cannot follow the theme. The allowlist is the three blocks where
   tokens are legitimately DEFINED, plus @font-face and the keyframes that animate a
   token's own value. */
const src = join(root, "src");
const TOKEN_BLOCK = /^\s*(:root|\[data-theme|html\[data-theme|@media \(prefers-)/;
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/;

const literals = [];
const jsSetProps = new Set();
for (const name of readdirSync(src, { recursive: true })) {
  const path = join(src, String(name));
  if (/\.(tsx?|css)$/.test(String(name)) === false) continue;
  const text = readFileSync(path, "utf8");
  for (const m of text.matchAll(/setProperty\(\s*["'`](--[\w-]+)/g)) jsSetProps.add(m[1]);
  if (!String(name).endsWith(".css")) continue;

  let inTokenBlock = false;
  let inComment = false;
  let depth = 0;
  text.split("\n").forEach((line, i) => {
    const opens = line.lastIndexOf("/*");
    const closes = line.lastIndexOf("*/");
    const wasInComment = inComment;
    if (opens > closes) inComment = true;
    else if (closes > opens) inComment = false;
    if (wasInComment) return;

    if (depth === 0 && TOKEN_BLOCK.test(line)) inTokenBlock = true;
    const before = depth;
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (inTokenBlock && depth === 0 && before > 0) inTokenBlock = false;
    if (inTokenBlock || /^\s*--/.test(line) || /@font-face|@keyframes/.test(line)) return;
    // color-mix(... var(--token) ...) still follows the theme; it is a token, mixed.
    const stripped = line.replace(/color-mix\([^;]*var\(--[^;]*\)/g, "");
    if (COLOUR.test(stripped)) literals.push(`${name}:${i + 1}  ${line.trim()}`);
  });
}

/* var(--x) with no CSS definition anywhere and no JS setProperty is a typo that
   renders as nothing. Four are legitimately JS-driven (--nav-progress, --track-h,
   --slots, --slot) and the setProperty scan is what keeps them out of this list. */
const allCss = readdirSync(src)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(src, f), "utf8"))
  .join("\n");
const defined = new Set([...allCss.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
const undefinedVars = [...new Set([...allCss.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))].filter((v) => !defined.has(v) && !jsSetProps.has(v));

if (literals.length) {
  failed = true;
  console.log(`FAIL colour literals outside a token block: ${literals.length}`);
  for (const l of literals) console.log(`       ${l}`);
} else {
  console.log("ok   colour literals outside a token block: 0");
}
if (undefinedVars.length) console.log(`warn undefined custom properties: ${undefinedVars.join(", ")}`);

if (failed) {
  console.error("check-size: budget or token check failed (see docs/ARCHITECTURE_PLAN.md §6.5).");
  process.exit(1);
}
