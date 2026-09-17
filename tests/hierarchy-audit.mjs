/**
 * Visual-hierarchy audit — plus axe-core for the accessibility half
 * this project's own auditor does not cover.
 *
 *   node tests/hierarchy-audit.mjs            (needs the engine on :5180)
 *   node tests/hierarchy-audit.mjs --themes focus
 *
 * WHY THIS FILE EXISTS, honestly stated.
 *
 * There is no industry-standard automated auditor for visual hierarchy,
 * the way WCAG 1.4.3 gives one for contrast. Contrast is a physical
 * measurement with an agreed threshold; hierarchy is a judgement about
 * whether the loudest thing on screen is the most important thing, and
 * nobody has standardised that. What EXISTS off the shelf is:
 *
 *   axe-core / Lighthouse   accessibility rules — roles, names, labels,
 *                           landmarks, focus order. Real standard, real
 *                           coverage, and complementary to ours: it
 *                           checks the things a DOM measurement cannot
 *                           infer. Used below.
 *   Percy / Chromatic /     visual regression — they catch CHANGE, not
 *   BackstopJS              quality. They cannot tell you a screen was
 *                           badly designed, only that it differs from
 *                           the last badly designed version.
 *   Figma design linters    operate on design files, not a running app.
 *
 * So the hierarchy half is written here, and it reports MEASUREMENTS
 * before verdicts. The counts below are the observable symptoms of a
 * type system that was never designed — you cannot automate taste, but
 * you can count how many different answers one screen gives to the same
 * question, and a screen with fourteen font sizes did not choose them.
 *
 * The one hard RULE is competing emphasis, because it is checkable
 * without taste: if two elements inside one card are both in the
 * largest size AND bold AND coloured, neither is the entry point, and
 * the reader has to decide what the designer did not.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const PORT = Number(arg('port', 4181));
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = arg('root', 'dist/renderer');
const THEMES = arg('themes', 'focus,warroom,energy,corporate,journey,rize').split(',');
// serve.mjs's own default (127.0.0.1:5180) is the real app's engine
// port too — fine when nothing else is running, but this audit writes
// through it (theme, panel_layout, whatever a crawled screen's own
// onClick does), so pointing it at a real dev session's engine would
// mutate real data. --engine lets a throwaway engine on another port
// stand in without needing the real one stopped.
const ENGINE = arg('engine', 'http://127.0.0.1:5180');

// Guidance, not law — and the report says so. Sources are the ordinary
// typographic conventions a design system encodes: a modular scale has
// steps you can name, and beyond about six nobody can.
const MAX_SIZES = 6;
const MAX_WEIGHTS = 3;
const MAX_TEXT_COLOURS = 6;

const SCREENS = [
  { name: 'PLAN · today', steps: ['PLAN', 'Today'] },
  { name: 'PLAN · mindset', steps: ['PLAN', 'Mindset'] },
  { name: 'EXECUTE · hours', steps: ['EXECUTE', 'HOURS'] },
  { name: 'EXECUTE · MIT', steps: ['EXECUTE', 'MIT'] },
  // Second wave (2026-09-17): PLAN/EXECUTE are the two panel-3 tabs;
  // these three are all full-screen overlays, opened over whatever was
  // showing and (App.tsx) closed by their own "← Back" button — NOT
  // Escape, which only closes a separate dialogStack (Settings/
  // Shortcuts) App.tsx keeps distinct from `overlay`. First attempt used
  // Escape and got three identical Business-Analysis measurements back
  // for Business Analysis/Journey/BDP, because the overlay never closed
  // and every later click silently failed against an obscured target
  // (Playwright's actionability check waits for visible-and-unobscured,
  // then times out and no-ops) rather than throwing. HabitDashboard.tsx
  // is NOT in this list: grep confirms no other file in renderer/src
  // imports it, so it is unreachable from the running app (mid-flight
  // habits removal) and there is no button this audit — or a real user —
  // could click to get there. CircleSection is not its own entry either:
  // it renders inline inside Business Analysis's own PEOPLE card, so
  // visiting Analysis already covers it.
  { name: 'Business Analysis', steps: ['← Back', 'Analysis'] },
  { name: 'Journey', steps: ['← Back', 'Journey'] },
  // ToolsMenu's own entries are role="menuitem" (a real ARIA role,
  // overriding the <button>'s implicit one) — the trigger's own
  // accessible name is its glyph content ('⚙'), not its title="Tools".
  { name: 'BDP (Income Opportunities)', steps: ['← Back', '⚙', { label: 'Income Opportunities', role: 'menuitem' }] },
];

const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

const MEASURE = () => {
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const hasOwnText = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const texts = [...document.querySelectorAll('body *')].filter((el) => vis(el) && hasOwnText(el));

  const sizes = new Map();
  const weights = new Map();
  const colours = new Map();
  const lefts = new Map();
  for (const el of texts) {
    const cs = getComputedStyle(el);
    const px = Math.round(parseFloat(cs.fontSize));
    sizes.set(px, (sizes.get(px) ?? 0) + 1);
    const w = cs.fontWeight;
    weights.set(w, (weights.get(w) ?? 0) + 1);
    colours.set(cs.color, (colours.get(cs.color) ?? 0) + 1);
    const x = Math.round(el.getBoundingClientRect().left / 2) * 2;
    lefts.set(x, (lefts.get(x) ?? 0) + 1);
  }

  // Competing emphasis. A "card" is any element that draws its own
  // border or background — the containers a reader perceives as one
  // thing. Inside each, count the elements wearing ALL THREE emphasis
  // signals at once: the card's largest size, bold, and a colour that
  // is not the body colour.
  const bodyColour = getComputedStyle(document.body).color;
  const cards = [...document.querySelectorAll('body *')].filter((el) => {
    if (!vis(el)) return false;
    const cs = getComputedStyle(el);
    const painted = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px';
    const r = el.getBoundingClientRect();
    return painted && r.height > 40 && r.width > 80;
  });
  // The app's body size — the size most of its text is. A card whose
  // largest text IS the body size has no size hierarchy to be at the top
  // of, so "largest AND bold AND coloured" describes an ordinary label,
  // not a competing headline. Without this the rule reported every
  // section label and its count.
  const bodySize = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  const competing = [];
  for (const card of cards) {
    const inside = texts.filter((t) => card.contains(t) && t !== card);
    if (inside.length < 2) continue;
    // Only the innermost card owning this text, so one row is not
    // reported once per ancestor.
    const own = inside.filter((t) => !cards.some((c) => c !== card && card.contains(c) && c.contains(t)));
    // Fewer than three texts is a label and a value, not a hierarchy:
    // "Morning 0/2" has no entry point to get wrong. The rule is about
    // a card where the reader has to CHOOSE where to start.
    if (own.length < 3) continue;
    const max = Math.max(...own.map((t) => parseFloat(getComputedStyle(t).fontSize)));
    if (max <= bodySize) continue;
    const loud = own.filter((t) => {
      const cs = getComputedStyle(t);
      return (
        Math.abs(parseFloat(cs.fontSize) - max) < 0.5 &&
        Number(cs.fontWeight) >= 600 &&
        cs.color !== bodyColour
      );
    });
    if (loud.length > 1) {
      competing.push({
        card: card.className || card.tagName.toLowerCase(),
        size: Math.round(max),
        items: loud.slice(0, 4).map((t) => t.textContent.trim().slice(0, 24)),
      });
    }
  }

  const top = (m, n = 99) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}×${v}`);

  return {
    elements: texts.length,
    sizes: [...sizes.keys()].sort((a, b) => a - b),
    sizeCounts: top(sizes),
    weights: [...weights.keys()].sort(),
    weightCounts: top(weights),
    colours: colours.size,
    colourCounts: top(colours, 8),
    leftEdges: lefts.size,
    competing,
  };
};

const run = async () => {
  const server = spawn('node', ['tests/serve.mjs', ROOT, String(PORT), ENGINE], { stdio: 'inherit' });
  await sleep(700);
  try {
    const probe = await fetch(`${BASE}/health`);
    if (!probe.ok) throw new Error(String(probe.status));
  } catch (e) {
    server.kill();
    console.error(`No engine behind ${BASE}/health, proxied to ${ENGINE} (${e.message}). Start it, or pass --engine.`);
    process.exit(2);
  }

  const browser = await chromium.launch({
    executablePath: process.env.UX_AUDIT_CHROMIUM || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 990 } });
  await page.addInitScript(() => {
    window.api = {
      healthCheck: () => fetch('/health').then((r) => r.json()),
      request: async (m, path, body) => {
        const res = await fetch(path, {
          method: m,
          headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        if (res.status === 204) return null;
        return res.json();
      },
      exportSave: async () => ({ ok: false, cancelled: true }),
      pickFile: async () => null,
      pickImage: async () => null,
      readImage: async () => null,
      openPath: async () => ({ ok: true, error: null }),
      setPanelLayout: async () => ({ ok: true }),
      windowControl: async () => ({ maximised: false }),
      windowState: async () => ({ maximised: false, platform: 'win32' }),
    };
  });

  // A step is a label (role defaults to 'button') or {label, role} for
  // anything else — ToolsMenu's own entries render role="menuitem", an
  // explicit ARIA role which OVERRIDES the implicit role a <button>
  // would otherwise have, so getByRole('button', ...) silently finds
  // nothing for them. Same shape of bug as the missing PLAN "Today" tab:
  // wrong role, not wrong text, and both fail the same way — quietly.
  const click = async (step) => {
    // { key: 'Escape' } presses a key instead of clicking — the overlays
    // (Analysis/Journey/BDP) stay open once opened, and App.tsx's own
    // close mechanism is Escape for "the topmost thing", not a button
    // every overlay repeats. Harmless to press with nothing open.
    if (typeof step === 'object' && step.key) {
      await page.keyboard.press(step.key);
      await sleep(250);
      return;
    }
    const { label, role = 'button' } = typeof step === 'string' ? { label: step } : step;
    const el = page.getByRole(role, { name: label, exact: true }).first();
    if (await el.count()) {
      await el.click({ timeout: 3000 }).catch(() => {});
      await sleep(250);
    }
  };

  const report = { generatedAt: new Date().toISOString(), screens: [], axe: [] };

  for (const theme of THEMES) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(async (t) => {
      await fetch('/api/settings/theme', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: t }),
      });
      await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ panel_layout: 'full' }),
      });
    }, theme);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await sleep(900);

    for (const screen of SCREENS) {
      for (const step of screen.steps) await click(step);
      await sleep(350);
      const rendered = await page.evaluate(() => document.querySelectorAll('body *').length);
      if (rendered < 150) {
        console.log(`  !! ${theme} / ${screen.name}: only ${rendered} elements — skipping`);
        continue;
      }
      const m = await page.evaluate(MEASURE);
      report.screens.push({ theme, screen: screen.name, ...m });

      // axe-core, once per theme on panel-3's busiest tab plus each of
      // the three overlays — its rules are about structure, which does
      // not change between PLAN's own tabs (so one of those is enough),
      // but an overlay is genuinely different DOM (a dialog-shaped
      // screen, not a tab), so each earns its own run rather than
      // inheriting EXECUTE · MIT's clean result on trust.
      if (['EXECUTE · MIT', 'Business Analysis', 'Journey', 'BDP (Income Opportunities)'].includes(screen.name)) {
        await page.evaluate(AXE);
        const res = await page.evaluate(async () =>
          // eslint-disable-next-line no-undef
          (await axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => ({
            id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
            sample: v.nodes.slice(0, 2).map((n) => n.html.slice(0, 90)),
          })),
        );
        report.axe.push({ theme, screen: screen.name, violations: res });
      }
    }
  }

  await browser.close();
  server.kill();

  // ── Report ─────────────────────────────────────────────────────────
  const byScreen = new Map();
  for (const s of report.screens) {
    if (!byScreen.has(s.screen)) byScreen.set(s.screen, []);
    byScreen.get(s.screen).push(s);
  }
  console.log('\n═══ TYPE SYSTEM ═══  (measurements, not verdicts)\n');
  console.log('screen                 sizes  weights  colours  left-edges  text els');
  for (const [name, rows] of byScreen) {
    const r = rows[0];
    console.log(
      `${name.padEnd(22)} ${String(r.sizes.length).padStart(5)} ${String(r.weights.length).padStart(8)}` +
        ` ${String(r.colours).padStart(8)} ${String(r.leftEdges).padStart(11)} ${String(r.elements).padStart(9)}`,
    );
  }
  const all = report.screens[0];
  if (all) {
    console.log(`\nsizes in use: ${all.sizeCounts.join('  ')}`);
    console.log(`weights:      ${all.weightCounts.join('  ')}`);
  }

  const flags = [];
  for (const [name, rows] of byScreen) {
    const r = rows[0];
    if (r.sizes.length > MAX_SIZES) flags.push(`${name}: ${r.sizes.length} font sizes (guide: <= ${MAX_SIZES}) — ${r.sizes.join(', ')}`);
    if (r.weights.length > MAX_WEIGHTS) flags.push(`${name}: ${r.weights.length} font weights (guide: <= ${MAX_WEIGHTS})`);
    if (r.colours > MAX_TEXT_COLOURS) flags.push(`${name}: ${r.colours} text colours (guide: <= ${MAX_TEXT_COLOURS})`);
  }
  console.log('\n═══ ABOVE THE GUIDE ═══\n');
  if (!flags.length) console.log('  nothing');
  for (const f of flags) console.log('  ' + f);

  console.log('\n═══ COMPETING EMPHASIS ═══  (the one hard rule)\n');
  const comp = report.screens.flatMap((s) => s.competing.map((c) => ({ screen: s.screen, ...c })));
  if (!comp.length) console.log('  none — every card has one loudest element');
  const seen = new Set();
  for (const c of comp) {
    // Digits stripped from the key: the live clock is one of the
    // competing elements, so a raw text key reported the same card once
    // per second of the audit.
    const k = c.screen + '|' + c.items.join('|').replace(/\d/g, '#');
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  ${c.screen}: ${c.size}px bold+coloured × ${c.items.length} — ${c.items.join(' / ')}`);
  }

  console.log('\n═══ AXE-CORE ═══  (WCAG 2.2 A/AA, the parts a DOM measurement cannot infer)\n');
  // Keyed by rule+screen, not rule alone — the same rule firing on two
  // different screens (a tab vs. an overlay) is two separate findings,
  // and merging them would silently drop which one a fix needs to land in.
  const axeSeen = new Map();
  for (const a of report.axe) for (const v of a.violations) {
    const k = `${v.id}|${a.screen ?? 'EXECUTE · MIT'}`;
    if (!axeSeen.has(k)) axeSeen.set(k, { ...v, screen: a.screen ?? 'EXECUTE · MIT', themes: [] });
    axeSeen.get(k).themes.push(a.theme);
  }
  if (!axeSeen.size) console.log('  no violations');
  for (const v of axeSeen.values()) {
    console.log(`  [${v.impact}] ${v.id} — ${v.help}  (${v.screen})`);
    console.log(`      ${v.nodes} node(s), ${v.themes.length}/${THEMES.length} themes`);
    for (const s of v.sample) console.log(`      ${s}`);
  }

  writeFileSync('hierarchy-audit.json', JSON.stringify(report, null, 2));
  console.log('\nfull report: hierarchy-audit.json');
};

run();
