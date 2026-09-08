/**
 * Fails if any spacing value in the renderer is off the scale.
 *
 * A scale that lives only in a comment is a scale that lasts until the
 * next hurried edit. This reads the source the way the sweep did and
 * refuses anything that is not one of the seven allowed numbers, so the
 * next 10px padding is caught the day it is written rather than in an
 * audit six weeks later.
 *
 *   node tests/spacing-check.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set([0, 2, 4, 8, 12, 16, 24, 32]);
const PROPS = '(?:padding|margin|gap|rowGap|columnGap)(?:Top|Bottom|Left|Right)?';
const NUM = new RegExp(`\\b(${PROPS}): (\\d+)(?![\\d.])`, 'g');
const STR = new RegExp(`\\b(${PROPS}): '([^']*)'`, 'g');

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
    const n = Number(m[2]);
    if (!ALLOWED.has(n)) bad.push(`${file}:${lineOf(m.index)}  ${m[1]}: ${n}`);
  }
  for (const m of src.matchAll(STR)) {
    const value = m[2].trim();
    // Only shorthand made of px/0 tokens is ours to judge; 'auto' and
    // anything with a var() or calc() is not a scale decision.
    if (!/^(?:\d+px|0)(?:\s+(?:\d+px|0))*$/.test(value)) continue;
    for (const tok of value.split(/\s+/)) {
      const n = tok === '0' ? 0 : Number(tok.slice(0, -2));
      if (!ALLOWED.has(n)) bad.push(`${file}:${lineOf(m.index)}  ${m[1]}: '${value}'  (${tok})`);
    }
  }
}

if (bad.length) {
  console.error(`${bad.length} spacing values off the scale (allowed: ${[...ALLOWED].join(', ')}):\n`);
  for (const b of bad) console.error('  ' + b);
  console.error('\nSee renderer/src/spacing.ts for what each step is for.');
  process.exit(1);
}
console.log(`spacing clean — every value on the ${[...ALLOWED].join('/')} scale`);
