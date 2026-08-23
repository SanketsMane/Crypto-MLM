#!/usr/bin/env node
/**
 * A ceiling on what the browser has to download.
 *
 * Bundle size is not a vanity metric on this product. Members check a balance
 * on a phone, often on a slow connection, and every kilobyte here is time spent
 * looking at a blank screen before a number appears. Left unmeasured it only
 * ever goes one way — a chart library imported for one screen, an icon set
 * pulled in whole, a date library that could have been four lines.
 *
 * The budgets below are set a little above what the app currently ships, so
 * this fails on a regression rather than on ordinary work. Raising one is a
 * deliberate decision with a number attached, which is the point.
 *
 *   node scripts/bundle-budget.mjs
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHUNKS = '.next/static/chunks';

/** Gzipped kilobytes, which is what actually crosses the wire. */
const BUDGETS = {
  /** Everything the browser could be asked for. */
  totalKb: 760,
  /** The single largest chunk — a runaway dependency shows up here first. */
  largestChunkKb: 125,
};

if (!existsSync(CHUNKS)) {
  console.error('No build found. Run `npm run build` first.');
  process.exit(1);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (entry.name.endsWith('.js')) out.push(path);
  }
  return out;
}

const files = await walk(CHUNKS);
const measured = files
  .map((path) => {
    const raw = readFileSync(path);
    return { path, rawKb: raw.length / 1024, gzKb: gzipSync(raw, { level: 6 }).length / 1024 };
  })
  .sort((a, b) => b.gzKb - a.gzKb);

const totalKb = measured.reduce((sum, f) => sum + f.gzKb, 0);
const largest = measured[0];

console.log('\nBundle budget — gzipped\n');
console.log('  largest chunks:');
for (const f of measured.slice(0, 5)) {
  console.log(`    ${f.gzKb.toFixed(1).padStart(7)} KB  (${f.rawKb.toFixed(0).padStart(4)} raw)  ${f.path.split('/').pop()}`);
}

const checks = [
  ['total', totalKb, BUDGETS.totalKb],
  ['largest chunk', largest.gzKb, BUDGETS.largestChunkKb],
];

console.log(`\n  ${files.length} chunks\n`);
let failed = false;
for (const [label, actual, budget] of checks) {
  const pass = actual <= budget;
  const headroom = budget - actual;
  if (!pass) failed = true;
  const margin = pass
    ? `${headroom.toFixed(1)} KB to spare`
    : `${Math.abs(headroom).toFixed(1)} KB over`;
  console.log(
    `  ${pass ? 'PASS' : 'OVER'}  ${label.padEnd(14)} ${actual.toFixed(1).padStart(7)} KB` +
    `  / ${String(budget).padStart(4)} KB  (${margin})`,
  );
}

if (failed) {
  console.error(
    '\nThe bundle grew past its budget. Either trim what was added, or raise the\n' +
    'number in scripts/bundle-budget.mjs deliberately and say why.\n',
  );
  process.exit(1);
}
console.log('\nWithin budget.\n');
