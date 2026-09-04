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
// Headroom left is deliberate and small: P1 must stay near these numbers.
const BUDGETS = { js: 76 * KB, css: 12 * KB };

const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const files = readdirSync(assets);

let jsBytes = 0;
let cssBytes = 0;
for (const f of files) {
  const size = gz(join(assets, f));
  if (f.endsWith(".js")) jsBytes += size;
  else if (f.endsWith(".css")) cssBytes += size;
}

const rows = [
  ["initial JS (gzip)", jsBytes, BUDGETS.js],
  ["CSS (gzip)", cssBytes, BUDGETS.css],
];

let failed = false;
for (const [label, actual, budget] of rows) {
  const ok = actual <= budget;
  if (!ok) failed = true;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${(actual / KB).toFixed(1)} KB / ${(budget / KB).toFixed(0)} KB`);
}

if (failed) {
  console.error("check-size: size budget exceeded (see docs/ARCHITECTURE_PLAN.md §6.5).");
  process.exit(1);
}
