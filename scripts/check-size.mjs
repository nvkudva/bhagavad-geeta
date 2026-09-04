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
const BUDGETS = { js: 65 * KB, css: 3 * KB };

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
