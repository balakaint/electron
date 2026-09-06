// REPL driver for the Habit OS Electron app. This WSL environment has
// a real X display via WSLg (DISPLAY=:0) — no xvfb needed, unlike the
// generic cold-container recipe. Run under tmux; send-keys commands,
// capture-pane the output.
import { _electron as electron } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

let app = null;
let page = null;

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/electron');

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched');
    app = await electron.launch({
      executablePath: electronBin,
      args: ['--no-sandbox', APP_DIR],
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
      timeout: 30_000,
    });
    page = await app.firstWindow();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('PAGE CONSOLE ERROR:', msg.text());
    });
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
    await page.waitForSelector('text=Habit OS', { timeout: 20_000 }).catch(() => {});
    console.log('launched.', app.windows().length, 'window(s):', page.url());
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'OK';
    }, sel);
    console.log('click', sel, '->', r);
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const el = els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'OK: ' + el.tagName;
    }, text);
    console.log('click-text', JSON.stringify(text), '->', r);
  },

  // Gotcha this exists for: a locator built on an input's `value`
  // attribute (page.locator('input[value="X"]')) breaks the instant
  // you .fill() that same input, because the live locator re-resolves
  // on every action and the new value no longer matches. Grabbing the
  // ElementHandle ONCE via $() and acting on the handle sidesteps this
  // entirely — use this for any controlled-input edit, not just when
  // you happen to hit the bug.
  //
  // Selector almost always contains a space itself (this app's inputs
  // are commonly matched by placeholder/value text, e.g.
  // input[placeholder="+ Add goal…"]) — a naive first-space split
  // truncates it. Quote the selector to disambiguate:
  //   fill "input[value='YEARLY']" BIG BETS
  // Unquoted still works for selectors with no spaces.
  async fill(args) {
    if (!page) return console.log('ERROR: launch first');
    let sel, text;
    if (args[0] === '"' || args[0] === "'") {
      const q = args[0];
      const end = args.indexOf(q, 1);
      if (end === -1) return console.log('ERROR: unterminated quote in selector');
      sel = args.slice(1, end);
      text = args.slice(end + 1).trimStart();
    } else {
      const sp = args.indexOf(' ');
      sel = sp === -1 ? args : args.slice(0, sp);
      text = sp === -1 ? '' : args.slice(sp + 1);
    }
    const handle = await page.$(sel);
    if (!handle) return console.log('NOT_FOUND:', sel);
    await handle.fill(text);
    console.log('fill', sel, '<-', JSON.stringify(text));
  },

  async blur() {
    if (page) await page.keyboard.press('Tab');
  },

  async type(text) {
    if (page) await page.keyboard.type(text, { delay: 30 });
  },
  async press(key) {
    if (page) await page.keyboard.press(key);
  },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try {
      await page.waitForSelector(sel, { timeout: 10_000 });
      console.log('found:', sel);
    } catch {
      console.log('TIMEOUT:', sel);
    }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try {
      console.log(JSON.stringify(await page.evaluate(expr)));
    } catch (e) {
      console.log('ERROR:', e.message);
    }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(
      await page.evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)', sel || null),
    );
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first');
    for (const w of app.windows()) console.log(' ', w.url());
  },

  async quit() {
    if (app) await app.close().catch(() => {});
    app = null;
    page = null;
  },
  help() {
    console.log('commands:', Object.keys(COMMANDS).join(', '));
  },
};

const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

rl.on('line', async (line) => {
  const sp = line.indexOf(' ');
  const cmd = sp === -1 ? line.trim() : line.slice(0, sp);
  const rest = sp === -1 ? '' : line.slice(sp + 1);
  if (!cmd) return rl.prompt();
  const fn = COMMANDS[cmd];
  if (!fn) {
    console.log('unknown:', cmd, '- try: help');
    return rl.prompt();
  }
  try {
    await fn(rest);
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  if (cmd === 'quit') {
    rl.close();
    process.exit(0);
  }
  rl.prompt();
});
rl.on('close', async () => {
  await COMMANDS.quit();
  process.exit(0);
});

console.log('habit-os driver - "help" for commands, "launch" to start');
rl.prompt();
