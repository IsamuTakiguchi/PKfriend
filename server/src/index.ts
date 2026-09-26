import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { ClientMsg, ServerMsg, Player } from '@pkfriend/shared';
import { type Client, createRoom, getRoom, deleteIfEmpty, sweepRooms, roomCount, BattleRoom, TradeRoom } from './rooms.js';

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: roomCount(), time: Date.now() }));

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

const send = (ws: WebSocket, msg: ServerMsg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const sanitizePlayer = (p: Player): Player => ({ id: String(p.id).slice(0, 40), name: String(p.name || 'トレーナー').slice(0, 16), avatarSpeciesId: Number(p.avatarSpeciesId) || 25 });

wss.on('connection', ws => {
  let client: Client | null = null;
  send(ws, { t: 'welcome', serverTime: Date.now() });

  ws.on('message', raw => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(raw)); } catch { return send(ws, { t: 'error', message: 'bad json' }); }
    try { handle(msg); } catch (e) { console.error(e); send(ws, { t: 'error', message: 'サーバーエラー' }); }
  });

  function handle(msg: ClientMsg) {
    if (msg.t === 'ping') return send(ws, { t: 'pong' });
    if (msg.t === 'hello') { client = { ws, player: sanitizePlayer(msg.player), roomCode: null }; return; }
    if (!client) return send(ws, { t: 'error', message: 'まず hello を おくってください' });
    const room = client.roomCode ? getRoom(client.roomCode) : undefined;

    switch (msg.t) {
      case 'create_room': {
        if (room) { room.remove(client); deleteIfEmpty(room); }
        const r = createRoom(client, msg.kind, msg.difficulty, msg.bossSpeciesId);
        r.add(client); r.sync(); break;
      }
      case 'join_room': {
        const r = getRoom(msg.code);
        if (!r) return send(ws, { t: 'error', message: 'そのコードの へやは みつかりません' });
        if (room && room !== r) { room.remove(client); deleteIfEmpty(room); }
        if (r.members.has(client.player.id)) { r.members.get(client.player.id)!.client = client; client.roomCode = r.code; r.sync(); break; }
        const why = r.canJoin(); if (why) return send(ws, { t: 'error', message: why });
        r.add(client); r.sync(); break;
      }
      case 'leave_room': { if (room) { room.remove(client); deleteIfEmpty(room); } send(ws, { t: 'left' }); break; }
      case 'battle_select': { if (room instanceof BattleRoom) room.select(client, msg.pokemon); break; }
      case 'battle_start': { if (room instanceof BattleRoom) room.start(client); break; }
      case 'battle_action': { if (room instanceof BattleRoom) room.action(client, msg.moveId, msg.roulette, msg.special); break; }
      case 'catch_attempt': { if (room instanceof BattleRoom) room.catchAttempt(client, msg.ball); break; }
      case 'emote': { if (room) room.broadcast({ t: 'emote', playerId: client.player.id, playerName: client.player.name, emote: String(msg.emote).slice(0, 8) }); break; }
      case 'trade_offer': { if (room instanceof TradeRoom) room.offer(client, msg.pokemon); break; }
      case 'trade_confirm': { if (room instanceof TradeRoom) room.confirm(client, msg.confirmed); break; }
    }
  }

  ws.on('close', () => {
    if (!client) return;
    const room = client.roomCode ? getRoom(client.roomCode) : undefined;
    if (room) { room.remove(client); deleteIfEmpty(room); }
  });
});

setInterval(sweepRooms, 60_000).unref();
server.listen(PORT, () => console.log(`[pkfriend] listening on http://localhost:${PORT}  (ws: /ws)`));
