/**
 * Fails if any corner radius in the renderer is off the scale.
 *
 * Same argument as tests/spacing-check.mjs, and the same failure mode it
 * is guarding against: the app had ten different corner radii (2, 3, 4,
 * 5, 6, 8, 10, 11, 12, '50%') across 43 places, none of them wrong on
 * its own and all of them together reading as "nobody decided". A scale
 * that lives only in a comment lasts until the next hurried edit.
 *
 * Allowed: 0, RADIUS.control (4), RADIUS.card (8), RADIUS.pill (999) —
 * and the named constants are what should actually be written, since a
 * literal 8 does not say whether it meant "this is a card".
 *
 *   node tests/radius-check.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set([0, 4, 8, 999]);
const PROP = 'borderRadius';
const NUM = new RegExp(`\\b${PROP}: (\\d+)(?![\\d.])`, 'g');
const STR = new RegExp(`\\b${PROP}: '([^']*)'`, 'g');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const bad = [];
for (const file of walk('renderer/src')) {
  const src = readFileSync(file, 'utf8');
  const lineOf = (i) => src.slice(0, i).split('\n').length;

  for (const m of src.matchAll(NUM)) {
    const n = Number(m[1]);
    if (!ALLOWED.has(n)) bad.push(`${file}:${lineOf(m.index)}  ${PROP}: ${n}`);
  }
  // A string radius is either a px value we can judge or a percentage,
  // and '50%' is the shape RADIUS.pill exists to name.
  for (const m of src.matchAll(STR)) {
    const value = m[1].trim();
    if (/^\d+px$/.test(value)) {
      const n = Number(value.slice(0, -2));
      if (!ALLOWED.has(n)) bad.push(`${file}:${lineOf(m.index)}  ${PROP}: '${value}'`);
    } else if (/%$/.test(value)) {
      bad.push(`${file}:${lineOf(m.index)}  ${PROP}: '${value}'  (use RADIUS.pill)`);
    }
  }
}

if (bad.length) {
  console.error(`${bad.length} corner radii off the scale (allowed: ${[...ALLOWED].join(', ')}):\n`);
  for (const b of bad) console.error('  ' + b);
  console.error('\nSee renderer/src/spacing.ts — RADIUS.control / RADIUS.card / RADIUS.pill.');
  process.exit(1);
}
console.log(`radius clean — every corner on the ${[...ALLOWED].join('/')} scale`);
