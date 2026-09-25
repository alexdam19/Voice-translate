import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT } from '../src/shared/constants';
import { NET_TICK_MS, type C2S } from '../src/shared/protocol';
import { WarzoneServer } from './warzone';

const PORT = Number(process.env.PORT) || DEFAULT_PORT;
const SEED = Number(process.env.WARZONE_SEED) || Math.floor(Math.random() * 1e9);
const BOTS = process.env.WARZONE_BOTS !== undefined ? Number(process.env.WARZONE_BOTS) : 5;
const DIST = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Serves the built client (npm run build) so `npm start` is a one-process deploy.
const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: zone.humanCount, seed: SEED }));
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(DIST, rel || 'index.html');
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('IRONCRAWL Dead Zone server is running. Build the client with `npm run build`, or use `npm run dev` and open the Vite URL.');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

const zone = new WarzoneServer(SEED, BOTS);
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  const session = zone.connect({
    send: (m) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
    },
    close: () => ws.close(),
  });
  ws.on('message', (data) => {
    let msg: C2S;
    try {
      msg = JSON.parse(String(data)) as C2S;
    } catch {
      return;
    }
    if (msg && typeof msg === 'object' && typeof msg.t === 'string') session.message(msg);
  });
  ws.on('close', () => session.close());
  ws.on('error', () => session.close());
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.2, (now - last) / 1000);
  last = now;
  zone.tick(dt);
  zone.broadcastSnapshot();
}, NET_TICK_MS);

http.listen(PORT, () => {
  console.log(`[ironcrawl] Dead Zone server on http://localhost:${PORT}  (ws path /ws, seed ${SEED}, ${BOTS} bots)`);
});
