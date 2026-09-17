/**
 * Fails if any fontSize, fontWeight or letterSpacing in the renderer is
 * off the type scale.
 *
 * Same argument as tests/spacing-check.mjs and tests/radius-check.mjs.
 * fontWeight specifically needs more than a "does this start with a
 * digit" check: a real baseline run (tests/hierarchy-audit.mjs) found
 * 450 hiding inside a ternary (`fontWeight: cond ? 600 : 450`) and
 * 'bold'/'normal' hiding as quoted strings — both invisible to a check
 * that only reads the token immediately after "fontWeight: ". This one
 * reads the whole value up to the next comma/brace, so a ternary's
 * losing branch is checked exactly like its winning one.
 *
 * See renderer/src/typography.ts — TYPE_SIZE / TYPE_WEIGHT / TRACKING.
 *
 *   node tests/typography-check.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SIZE_ALLOWED = new Set([12, 13, 14, 16, 24, 30]);
const WEIGHT_ALLOWED = new Set([400, 600, 700]);
const TRACKING_ALLOWED = new Set([0.5, 1]);
const WEIGHT_WORD = { bold: 700, normal: 400 };

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

  // fontSize / letterSpacing: bare numeric literals immediately after
  // the property, same technique as spacing-check.mjs. Named constants
  // (TYPE_SIZE.md, a variable, an expression) are not this check's
  // business, the same way SPACE.md already isn't spacing-check's.
  for (const [prop, allowed] of [['fontSize', SIZE_ALLOWED], ['letterSpacing', TRACKING_ALLOWED]]) {
    const NUM = new RegExp(`\\b${prop}: (-?\\d+(?:\\.\\d+)?)(?![\\d.])`, 'g');
    for (const m of src.matchAll(NUM)) {
      const n = Number(m[1]);
      if (!allowed.has(n)) bad.push(`${file}:${lineOf(m.index)}  ${prop}: ${n}`);
    }
  }

  // fontWeight: everything up to the next , or } or ; — covers a bare
  // literal, a quoted 'bold'/'normal', AND a ternary's two BRANCHES.
  // Only the branches, not the whole expression: `frac >= 1 ? 600 : 400`
  // has a 1 in its CONDITION that is not a weight at all, so this splits
  // on the ternary's own ? and last : first and checks only what comes
  // after them.
  const WEIGHT = /\bfontWeight: ([^,};]+)/g;
  for (const m of src.matchAll(WEIGHT)) {
    const expr = m[1].trim();
    const qi = expr.indexOf('?');
    const branches = qi === -1 ? [expr] : [expr.slice(qi + 1, expr.lastIndexOf(':')), expr.slice(expr.lastIndexOf(':') + 1)];
    for (const branch of branches) {
      const nm = branch.match(/-?\d+(?:\.\d+)?/);
      if (nm) {
        const n = Number(nm[0]);
        if (!WEIGHT_ALLOWED.has(n)) bad.push(`${file}:${lineOf(m.index)}  fontWeight: ${n}  (in \`${expr}\`)`);
      }
      const wm = branch.match(/'(bold|normal)'/);
      if (wm) {
        const word = wm[1];
        bad.push(`${file}:${lineOf(m.index)}  fontWeight: '${word}'  (use ${WEIGHT_WORD[word]}, or TYPE_WEIGHT.${word})  (in \`${expr}\`)`);
      }
    }
  }
}

if (bad.length) {
  console.error(`${bad.length} type values off the scale:\n`);
  for (const b of bad) console.error('  ' + b);
  console.error('\nSee renderer/src/typography.ts — TYPE_SIZE / TYPE_WEIGHT / TRACKING.');
  process.exit(1);
}
console.log('typography clean — every size/weight/tracking on the scale');
