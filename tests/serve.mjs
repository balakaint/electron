// Static server for the built renderer, with /api and /health proxied to
// the Python engine.
//
// A proxy rather than letting the page call the engine directly, for two
// reasons. The engine has no CORS middleware (deliberately — it binds
// 127.0.0.1 and only Electron talks to it), so a cross-origin fetch from
// the audit page would be refused by the browser before it ever reached
// Python. And same-origin keeps the renderer's own CSP (connect-src
// 'self') satisfied, so the audit runs against the SHIPPED policy rather
// than a relaxed one — a CSP that only passes when disabled is not a
// policy anyone has tested.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] ?? 4180);
const ENGINE = process.argv[4] ?? 'http://127.0.0.1:5180';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    try {
      const upstream = await fetch(ENGINE + url.pathname + url.search, {
        method: req.method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: String(e) }));
    }
    return;
  }

  // Everything else is the built SPA. No directory traversal: normalize
  // then confirm the result is still under ROOT.
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(normalize(ROOT))) {
    res.writeHead(403);
    res.end('no');
    return;
  }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on :${PORT}`));
