/**
 * UX auditor — measures the RENDERED app, not its source.
 *
 * Why this exists: half the bugs found in this port were invisible to
 * code review and obvious the moment something measured the result. A
 * timer that printed "4:10.14644455909729", a title bar that was dark on
 * a light theme, a project title clipped mid-word. Every one of those
 * passed tsc, and every one is a number you can read off the DOM.
 *
 * Run:  node tests/ux-audit.mjs            (needs the engine on :5180)
 *       node tests/ux-audit.mjs --themes focus,warroom
 *
 * It builds the renderer, serves it with /api proxied to the engine
 * (tests/serve.mjs), drives Chromium through every theme and screen, and
 * writes ux-audit.json. Exits non-zero if anything High survives.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const PORT = Number(arg('port', 4180));
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = arg('root', 'dist/renderer');
const THEMES = arg('themes', 'focus,warroom,energy,corporate,journey,rize').split(',');

// ── Thresholds ───────────────────────────────────────────────────────
// Contrast is WCAG 1.4.3. "Large" is >=24px, or >=18.66px at weight 700
// — the spec's own definition, in px because that is what the DOM gives.
const CONTRAST_NORMAL = 4.5;
const CONTRAST_LARGE = 3.0;
// WCAG 2.2 AA target size. NOT the 44pt iOS figure: that is the
// native-mobile rule and this is a desktop app driven by a mouse.
const MIN_TARGET = 24;
const MIN_FONT = 12;

const SEVERITY = { contrast: 'High', target: 'Medium', font: 'Medium', truncation: 'High', token: 'Low' };

// The whole audit is one function evaluated inside the page, so it sees
// COMPUTED styles — the actual pixels, after the cascade, the theme
// variables and the browser's own defaults.
const COLLECT = ({ CONTRAST_NORMAL, CONTRAST_LARGE, MIN_TARGET, MIN_FONT }) => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  // Text sits on whatever is actually painted behind it, which is the
  // nearest ancestor with a non-transparent background — not the
  // element's own, which is usually transparent.
  const backdrop = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.99) return c;
      n = n.parentElement;
    }
    const c = parse(getComputedStyle(document.body).backgroundColor);
    return c && c.a > 0.99 ? c : { r: 255, g: 255, b: 255, a: 1 };
  };
  const selector = (el) => {
    const bits = [];
    let n = el;
    for (let i = 0; n && i < 4; i++, n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { bits.unshift(`${s}#${n.id}`); break; }
      const cls = (n.className && typeof n.className === 'string' ? n.className : '').trim().split(/\s+/)[0];
      if (cls) s += `.${cls}`;
      const sibs = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      if (sibs.length > 1) s += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      bits.unshift(s);
    }
    return bits.join(' > ');
  };

  const out = [];
  const CLICKY = 'button, a, input, select, textarea, [role=button], [role=tab], [onclick]';

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;

    // WCAG exempts inactive controls from the contrast rule. Without
    // this the audit drowns in deliberately-inert styling — every
    // greyed-out tick on an empty hour, every disabled tab.
    const inert =
      el.hasAttribute('disabled') ||
      el.getAttribute('aria-disabled') === 'true' ||
      cs.pointerEvents === 'none';

    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();

    if (ownText) {
      const size = parseFloat(cs.fontSize);
      const weight = Number(cs.fontWeight) || 400;

      if (size < MIN_FONT) {
        out.push({ rule: 'font', selector: selector(el), text: ownText.slice(0, 60),
                   measured: `${size.toFixed(1)}px`, want: `>= ${MIN_FONT}px` });
      }

      if (!inert) {
        const fg = parse(cs.color);
        // opacity on an ancestor genuinely dims the text, so fold it in
        // rather than measuring a colour nobody sees.
        let eff = 1;
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          eff *= Number(getComputedStyle(n).opacity);
        }
        const bg = backdrop(el);
        if (fg) {
          const blended = eff >= 0.999 ? fg : {
            r: fg.r * eff + bg.r * (1 - eff),
            g: fg.g * eff + bg.g * (1 - eff),
            b: fg.b * eff + bg.b * (1 - eff),
          };
          const large = size >= 24 || (size >= 18.66 && weight >= 700);
          const need = large ? CONTRAST_LARGE : CONTRAST_NORMAL;
          const got = ratio(blended, bg);
          if (got < need) {
            out.push({ rule: 'contrast', selector: selector(el), text: ownText.slice(0, 60),
                       measured: `${got.toFixed(2)}:1`, want: `>= ${need}:1`,
                       detail: `${cs.color} on rgb(${bg.r}, ${bg.g}, ${bg.b})`
                             + (eff < 0.999 ? ` at opacity ${eff.toFixed(2)}` : '')
                             + ` · ${size.toFixed(0)}px/${weight}` });
          }
        }
      }
    }

    if (el.matches(CLICKY) && !inert) {
      if (box.width < MIN_TARGET || box.height < MIN_TARGET) {
        out.push({ rule: 'target', selector: selector(el),
                   text: (el.textContent || el.getAttribute('title') || '').trim().slice(0, 60),
                   measured: `${Math.round(box.width)}x${Math.round(box.height)}`,
                   want: `>= ${MIN_TARGET}x${MIN_TARGET}` });
      }
    }

    // Truncation: content wider or taller than its box, on something
    // that is not scrollable on purpose. This is the check that finds
    // clipped labels — a title cut mid-word is invisible to every other
    // kind of test.
    const scrollable = /auto|scroll/.test(cs.overflow + cs.overflowX + cs.overflowY);
    if (!scrollable && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        out.push({ rule: 'truncation', selector: selector(el),
                   text: (el.textContent || '').trim().slice(0, 60),
                   measured: `${el.scrollWidth}px in ${el.clientWidth}px`, want: 'fits, or scrolls' });
      } else if (cs.overflow === 'hidden' && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
        out.push({ rule: 'truncation', selector: selector(el),
                   text: (el.textContent || '').trim().slice(0, 60),
                   measured: `${el.scrollHeight}px tall in ${el.clientHeight}px`, want: 'fits, or scrolls' });
      }
    }
  }
  return out;
};

// ── Screens: how to get there, from a freshly loaded page ────────────
const SCREENS = [
  { name: 'PLAN · today', steps: [['tab', 'PLAN'], ['tab', 'Today']] },
  { name: 'PLAN · mindset', steps: [['tab', 'PLAN'], ['tab', 'Mindset']] },
  { name: 'PLAN · discipline', steps: [['tab', 'PLAN'], ['tab', 'Discipline']] },
  { name: 'PLAN · consistency', steps: [['tab', 'PLAN'], ['tab', 'Consistency']] },
  { name: 'EXECUTE', steps: [['tab', 'EXECUTE']] },
  { name: 'EXECUTE · tomorrow', steps: [['tab', 'EXECUTE'], ['tab', 'tomorrow']] },
];

async function clickByText(page, text) {
  // EXACT, not :has-text(). :has-text is a case-insensitive SUBSTRING
  // match, so clicking "PLAN" also matched the "92-day plan 0/6 · 23d
  // left" link and opened the quarterly overlay. The audit then measured
  // a screen it had not asked for, reported a fraction of the findings,
  // and that looked exactly like a fix working.
  const el = page.getByRole('button', { name: text, exact: true }).first();
  if (await el.count()) {
    await el.click({ timeout: 3000 }).catch(() => {});
    await sleep(250);
    return true;
  }
  return false;
}

const run = async () => {
  const server = spawn('node', ['tests/serve.mjs', ROOT, String(PORT)], { stdio: 'inherit' });
  await sleep(700);

  // Refuse to run without an engine. Without this the app renders its
  // "Engine: not responding" shell — 27 elements instead of ~600 — and
  // the audit reports a handful of findings, which is indistinguishable
  // from a clean bill of health. That happened here: an engine died
  // mid-session and the next run showed contrast failures dropping from
  // 187 to 3, which looked exactly like the fix under test working.
  try {
    const probe = await fetch(`${BASE}/health`);
    if (!probe.ok) throw new Error(`status ${probe.status}`);
  } catch (e) {
    server.kill();
    console.error(
      `\nNo engine behind ${BASE}/health (${e.message}).\n` +
        `Start it first:  python python/main.py --port 5180\n` +
        `An audit without one measures the error screen.\n`,
    );
    process.exit(2);
  }

  // playwright-core ships no browser of its own; it drives one that is
  // already on the machine. UX_AUDIT_CHROMIUM names it explicitly, which
  // is also the escape hatch when the installed build and the pinned
  // playwright-core disagree about which revision to look for.
  const executablePath = process.env.UX_AUDIT_CHROMIUM || undefined;
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });

  // The renderer reaches the engine only through window.api, which
  // Electron's preload supplies. In a plain browser it is undefined and
  // every screen renders its error state, so the audit would measure an
  // empty app. This is the same contract over same-origin fetch, which
  // the proxy in serve.mjs makes possible.
  //
  // The thrown message matters as much as the data: main.ts throws
  // `${status} ${detail}` for an HTTP answer and lets fetch's own text
  // through for a connection failure, and api.ts tells those apart by
  // whether the message starts with digits. Get this wrong and the
  // retry logic behaves differently under audit than in the app.
  await page.addInitScript(() => {
    window.api = {
      healthCheck: () => fetch('/health').then((r) => r.json()),
      request: async (method, path, body) => {
        const res = await fetch(path, {
          method,
          headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        if (res.status === 204) return null;
        return res.json();
      },
      // Native dialogs have no meaning here. They answer "the user
      // cancelled", which is a real state the UI must handle anyway.
      exportSave: async () => ({ ok: false, cancelled: true }),
      pickFile: async () => null,
      pickImage: async () => null,
      readImage: async () => null,
      openPath: async () => ({ ok: true, error: null }),
      setPanelLayout: async () => ({ ok: true }),
    };
  });
  const findings = [];
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

  try {
    for (const theme of THEMES) {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      // Set the theme through the app's own persisted setting, so the
      // audit sees exactly what a user with that theme sees.
      await page.evaluate(async (t) => {
        await fetch('/api/settings/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme: t }),
        });
        // panel_layout is PERSISTED in AppState, so whatever the last
        // run left behind is what the next one opens in. An audit that
        // silently ran in compact — one panel instead of three — found a
        // fraction of the elements and read as a large improvement.
        // Assert the starting state instead of inheriting it.
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ panel_layout: 'full' }),
        });
      }, theme);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await sleep(900);

      for (const screen of SCREENS) {
        for (const [, label] of screen.steps) await clickByText(page, label);
        await sleep(400);
        // A tripwire, because a quiet report is indistinguishable from a
        // good one. The whole shell is ~600 elements; a few dozen means
        // something collapsed and the numbers below mean nothing.
        const rendered = await page.evaluate(() => document.querySelectorAll('body *').length);
        if (rendered < 150) {
          console.log(`  !! ${theme} / ${screen.name}: only ${rendered} elements rendered`);
        }
        const found = await page.evaluate(COLLECT, { CONTRAST_NORMAL, CONTRAST_LARGE, MIN_TARGET, MIN_FONT });
        for (const f of found) findings.push({ theme, screen: screen.name, severity: SEVERITY[f.rule], ...f });
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }

  // One element failing the same rule in six themes is ONE fix, so the
  // report groups before it counts. A list of 3,000 findings that is
  // really 40 problems is a list nobody reads.
  const key = (f) => `${f.rule}|${f.selector}|${f.measured}`;
  const groups = new Map();
  for (const f of findings) {
    const k = key(f);
    if (!groups.has(k)) groups.set(k, { ...f, themes: new Set(), screens: new Set() });
    groups.get(k).themes.add(f.theme);
    groups.get(k).screens.add(f.screen);
  }
  const grouped = [...groups.values()].map((g) => ({
    ...g, themes: [...g.themes], screens: [...g.screens],
  }));

  const order = { High: 0, Medium: 1, Low: 2 };
  grouped.sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule));

  writeFileSync('ux-audit.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    thresholds: { CONTRAST_NORMAL, CONTRAST_LARGE, MIN_TARGET, MIN_FONT },
    themes: THEMES, screens: SCREENS.map((s) => s.name),
    rawCount: findings.length, groupedCount: grouped.length,
    consoleErrors: [...new Set(consoleErrors)],
    findings: grouped,
  }, null, 2));

  const byRule = {};
  for (const g of grouped) {
    byRule[g.rule] ??= { High: 0, Medium: 0, Low: 0 };
    byRule[g.rule][g.severity]++;
  }
  console.log(`\n${findings.length} findings across ${THEMES.length} themes -> ${grouped.length} distinct\n`);
  console.log('rule        High  Med  Low');
  for (const [rule, c] of Object.entries(byRule)) {
    console.log(`${rule.padEnd(11)} ${String(c.High).padStart(4)} ${String(c.Medium).padStart(4)} ${String(c.Low).padStart(4)}`);
  }
  const high = grouped.filter((g) => g.severity === 'High');
  console.log(`\nTop ${Math.min(20, high.length)} High:`);
  for (const g of high.slice(0, 20)) {
    console.log(`  [${g.rule}] ${g.measured} (want ${g.want})`);
    console.log(`      ${g.text ? JSON.stringify(g.text) : '(no text)'}  ${g.detail ?? ''}`);
    console.log(`      ${g.selector}`);
    console.log(`      ${g.themes.length}/${THEMES.length} themes · ${g.screens.join(', ')}`);
  }
  if (consoleErrors.length) {
    console.log(`\nconsole errors (${consoleErrors.length}):`);
    for (const e of [...new Set(consoleErrors)].slice(0, 10)) console.log('  ' + e);
  }
  console.log(`\nfull report: ux-audit.json`);
  process.exit(high.length ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(2); });
