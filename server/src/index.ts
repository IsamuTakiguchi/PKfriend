import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { RoomHub, type ClientMsg, type Client, type Conn } from '@pkfriend/shared';

const PORT = Number(process.env.PORT ?? 8787);
const hub = new RoomHub();
const app = express();
app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: hub.count, time: Date.now() }));

// serve built client if present (production)
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [path.resolve(here, '../../../client/dist'), path.resolve(here, '../../client/dist'), path.resolve(process.cwd(), 'client/dist')];
const dist = candidates.find(p => existsSync(path.join(p, 'index.html')));
if (dist) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  console.log('[pkfriend] serving client from', dist);
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', ws => {
  const conn: Conn = { send: d => ws.send(d), get open() { return ws.readyState === 1; } };
  let client: Client | null = null;
  conn.send(JSON.stringify({ t: 'welcome', serverTime: Date.now() }));
  ws.on('message', raw => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(raw)); } catch { return conn.send(JSON.stringify({ t: 'error', message: 'bad json' })); }
    try { client = hub.handle(conn, client, msg); } catch (e) { console.error(e); conn.send(JSON.stringify({ t: 'error', message: 'サーバーエラー' })); }
  });
  ws.on('close', () => hub.disconnect(client));
});

setInterval(() => hub.sweep(), 60_000).unref();
server.listen(PORT, () => console.log(`[pkfriend] listening on http://localhost:${PORT}  (ws: /ws)`));
