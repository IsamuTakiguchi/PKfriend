// Multiplayer rooms (みんなでバトル / こうかん) and the message handling around them.
// Transport-agnostic: the Node server runs it over WebSocket, and in the browser the player who
// creates a room runs it and friends connect peer-to-peer (see client/src/p2p.ts).
import type { Player, OwnedPokemon, Battler, BattleState, BattleAction, BattleEvent, SpecialKind } from './types.js';
import type { BattleRoomView, TradeRoomView, RoomMember, ServerMsg, ClientMsg } from './protocol.js';
import { ROUND_SECONDS, MAX_RAID_MEMBERS } from './protocol.js';
import { makeRng, randomSeed, pick } from './rng.js';
import { getSpecies, createOwned, expGain } from './species.js';
import { wildBattler, battlerFromOwned, newBattle, resolveRound, bossActions } from './battle.js';
import { rollCatchBall, bestBall, type BallKind } from './catch.js';
import { bossPool } from './areas.js';

/** One connection to a player (a WebSocket, a WebRTC data channel, or an in-page loopback). */
export interface Conn { send(data: string): void; readonly open: boolean; }
export interface Client { conn: Conn; player: Player; roomCode: string | null; }

const ROOM_TTL_MS = 30 * 60 * 1000;

abstract class Room {
  code: string; hostId: string; members = new Map<string, { client: Client; ready: boolean }>(); lastActivity = Date.now();
  constructor(code: string, host: Client) { this.code = code; this.hostId = host.player.id; }
  abstract kind: 'battle' | 'trade';
  abstract view(): BattleRoomView | TradeRoomView;
  touch() { this.lastActivity = Date.now(); }
  memberViews(): RoomMember[] { return [...this.members.values()].map(m => ({ player: m.client.player, ready: m.ready, connected: m.client.conn.open })); }
  send(c: Client, msg: ServerMsg) { if (c.conn.open) c.conn.send(JSON.stringify(msg)); }
  broadcast(msg: ServerMsg) { for (const m of this.members.values()) this.send(m.client, msg); }
  sync() { this.broadcast({ t: 'room', room: this.view() }); }
  abstract canJoin(): string | null;
  add(c: Client) { this.members.set(c.player.id, { client: c, ready: false }); c.roomCode = this.code; this.touch(); }
  remove(c: Client) { this.members.delete(c.player.id); c.roomCode = null; if (this.hostId === c.player.id && this.members.size) this.hostId = [...this.members.keys()][0]; this.touch(); }
  get empty() { return this.members.size === 0; }
  dispose() {}
}

// ---------------------------------------------------------------- battle (raid) room
export class BattleRoom extends Room {
  kind = 'battle' as const;
  phase: BattleRoomView['phase'] = 'lobby';
  difficulty: 1 | 2 | 3;
  bossSpeciesId: number;
  boss: Battler | null = null;
  state: BattleState | null = null;
  rng = makeRng(randomSeed());
  selected = new Map<string, OwnedPokemon>();      // playerId -> chosen pokémon
  actions = new Map<string, BattleAction>();       // battlerUid -> action this round
  roundDeadline: number | null = null;
  timer: ReturnType<typeof setTimeout> | null = null;
  catchResults: BattleRoomView['catchResults'] = {};
  ballChoices: Record<string, BallKind> = {};
  chosenBall: BallKind | null = null;
  catchTimer: ReturnType<typeof setTimeout> | null = null;
  expGainValue = 0;

  constructor(code: string, host: Client, difficulty: 1 | 2 | 3 = 1, bossSpeciesId?: number) {
    super(code, host);
    this.difficulty = difficulty;
    this.bossSpeciesId = bossSpeciesId && bossPool().includes(bossSpeciesId) ? bossSpeciesId : pick(this.rng, bossPool());
  }

  canJoin() { if (this.members.size >= MAX_RAID_MEMBERS) return 'このへやは まんいんです'; if (this.phase === 'done') return 'このバトルは おわっています'; return null; }

  view(): BattleRoomView {
    return {
      code: this.code, kind: 'battle', hostId: this.hostId, members: this.memberViews(), phase: this.phase, boss: this.boss ?? this.previewBoss(),
      difficulty: this.difficulty, state: this.state, pendingUids: this.pendingUids(), roundDeadline: this.roundDeadline, catchResults: this.catchResults, ballChoices: this.ballChoices, chosenBall: this.chosenBall, expGain: this.expGainValue,
    };
  }

  private previewBoss(): Battler {
    const lvl = [8, 25, 45][this.difficulty - 1];
    const b = wildBattler(getSpecies(this.bossSpeciesId), lvl, makeRng(1), { boss: true, uid: 'boss' });
    return b;
  }

  pendingUids(): string[] {
    if (!this.state || this.phase !== 'battle') return [];
    return this.state.allies.filter(a => !a.fainted && !this.actions.has(a.uid)).map(a => a.uid);
  }

  select(c: Client, p: OwnedPokemon) {
    this.selected.set(c.player.id, p);
    const m = this.members.get(c.player.id); if (m) m.ready = true;
    if (this.phase === 'battle' && this.state) {
      // join mid-battle or swap after faint
      const existing = this.state.allies.find(a => a.ownerId === c.player.id);
      const battler = battlerFromOwned(p, c.player.id, c.player.name, 'ally');
      if (existing && !existing.fainted) { this.sync(); return; }
      if (existing) { this.state.allies = this.state.allies.filter(a => a.uid !== existing.uid); }
      this.state.allies.push(battler);
      this.broadcast({ t: 'joined_battle', battler, playerName: c.player.name });
    }
    this.sync();
    this.touch();
  }

  start(c: Client) {
    if (c.player.id !== this.hostId) return this.send(c, { t: 'error', message: 'ホストだけが スタートできます' });
    if (this.phase !== 'lobby') return;
    const allies: Battler[] = [];
    for (const [pid, m] of this.members) { const p = this.selected.get(pid); if (p) allies.push(battlerFromOwned(p, pid, m.client.player.name, 'ally')); }
    if (!allies.length) return this.send(c, { t: 'error', message: 'だれも ポケモンを えらんでいません' });
    const lvl = [8, 25, 45][this.difficulty - 1];
    const hpMul = 1.5 + allies.length * 0.8 + (this.difficulty - 1);
    this.boss = wildBattler(getSpecies(this.bossSpeciesId), lvl, this.rng, { boss: true, hpMultiplier: hpMul, uid: 'boss', shiny: this.rng() < 1 / 32 });
    this.state = newBattle(allies, [this.boss]);
    this.phase = 'battle';
    this.openRound();
    this.sync();
  }

  private openRound() {
    this.actions.clear();
    this.roundDeadline = Date.now() + ROUND_SECONDS * 1000;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.resolve(), ROUND_SECONDS * 1000 + 200);
  }

  action(c: Client, moveId: string, roulette?: number, special?: SpecialKind) {
    if (this.phase !== 'battle' || !this.state) return;
    const b = this.state.allies.find(a => a.ownerId === c.player.id && !a.fainted);
    if (!b) return;
    if (!b.moves.includes(moveId)) return this.send(c, { t: 'error', message: 'そのわざは つかえません' });
    const r = roulette === undefined ? undefined : Math.max(1, Math.min(13, Math.round(Number(roulette) || 5)));
    this.actions.set(b.uid, { battlerUid: b.uid, moveId, targetUid: this.boss!.uid, roulette: r, special });
    this.touch();
    if (this.pendingUids().length === 0) this.resolve();
    else this.sync();
  }

  private resolve() {
    if (this.phase !== 'battle' || !this.state) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    // auto-pick for anyone who didn't choose
    for (const a of this.state.allies) if (!a.fainted && !this.actions.has(a.uid)) this.actions.set(a.uid, { battlerUid: a.uid, moveId: a.moves[0], targetUid: this.boss!.uid, roulette: 3 });
    // タッグバトルのルール: みんなが出した数字のうち いちばん大きい数字が つかわれる
    const nums = [...this.actions.values()].map(a => a.roulette ?? 5);
    const maxR = Math.max(...nums);
    for (const a of this.actions.values()) a.roulette = maxR;
    const acts = [...this.actions.values(), ...bossActions(this.state, this.rng)];
    const events: BattleEvent[] = resolveRound(this.state, acts, this.rng);
    this.roundDeadline = null;
    if (this.state.finished) {
      this.phase = this.state.winner === 'ally' ? 'catch' : 'done';
      this.expGainValue = this.state.winner === 'ally' ? expGain(this.boss!.speciesId, this.boss!.level, true) : 0;
      this.broadcast({ t: 'round', events, state: this.state, roundDeadline: null, pendingUids: [] });
      this.sync();
      return;
    }
    // give clients time to animate before the next round opens (~1.1s per event, min 3s)
    const animMs = Math.min(15000, Math.max(3000, events.length * 1100));
    this.actions.clear();
    this.roundDeadline = Date.now() + animMs + ROUND_SECONDS * 1000;
    this.timer = setTimeout(() => this.resolve(), animMs + ROUND_SECONDS * 1000 + 200);
    this.broadcast({ t: 'round', events, state: this.state, roundDeadline: this.roundDeadline, pendingUids: this.pendingUids() });
    this.sync();
  }

  private participants(): string[] { return [...new Set(this.state!.allies.map(a => a.ownerId))].filter(pid => this.members.has(pid)); }

  catchAttempt(c: Client, ball: BallKind) {
    if (this.phase !== 'catch' || !this.boss) return;
    if (this.chosenBall) return;
    if (!this.state!.allies.some(a => a.ownerId === c.player.id)) return this.send(c, { t: 'error', message: 'バトルに さんかしていません' });
    const b: BallKind = (['monster', 'super', 'hyper', 'master'] as BallKind[]).includes(ball) ? ball : 'monster';
    this.ballChoices[c.player.id] = b;
    this.touch();
    if (!this.catchTimer) this.catchTimer = setTimeout(() => this.resolveCatch(), 25_000);
    if (this.participants().every(pid => this.ballChoices[pid])) this.resolveCatch(); else this.sync();
  }

  /** タッグバトルのルール: みんなのボールのうち いちばん せいのうの良いボールで 1回だけ なげる。つかまえたら ぜんいんが ピックを ゲット。 */
  private resolveCatch() {
    if (this.phase !== 'catch' || !this.boss || this.chosenBall) return;
    if (this.catchTimer) { clearTimeout(this.catchTimer); this.catchTimer = null; }
    const parts = this.participants();
    const balls = parts.map(pid => this.ballChoices[pid]).filter(Boolean) as BallKind[];
    const ball = bestBall(balls.length ? balls : ['monster']);
    this.chosenBall = ball;
    const r = rollCatchBall(this.boss, ball, this.rng, { bonus: 0.3 * this.difficulty });
    for (const pid of parts) {
      const m = this.members.get(pid)!;
      const pokemon = r.success ? createOwned({ speciesId: this.boss.speciesId, level: this.boss.level, rng: this.rng, ownerId: pid, ownerName: m.client.player.name, origin: 'raid', shiny: this.boss.shiny }) : undefined;
      this.catchResults[pid] = { success: r.success, shakes: r.shakes, pokemon };
      this.broadcast({ t: 'catch_result', playerId: pid, success: r.success, shakes: r.shakes, pokemon, ball });
    }
    this.phase = 'done';
    this.sync();
  }

  remove(c: Client) {
    super.remove(c);
    this.selected.delete(c.player.id);
    if (this.state && this.phase === 'battle') {
      for (const a of this.state.allies) if (a.ownerId === c.player.id) { a.fainted = true; a.hp = 0; this.actions.delete(a.uid); }
      if (!this.state.allies.some(a => !a.fainted)) { this.state.finished = true; this.state.winner = 'foe'; this.phase = 'done'; }
      else if (this.pendingUids().length === 0) this.resolve();
    }
    this.sync();
  }
  dispose() { if (this.timer) clearTimeout(this.timer); if (this.catchTimer) clearTimeout(this.catchTimer); }
}

// ---------------------------------------------------------------- trade room
export class TradeRoom extends Room {
  kind = 'trade' as const;
  offers = new Map<string, { pokemon: OwnedPokemon | null; confirmed: boolean }>();
  phase: TradeRoomView['phase'] = 'offer';
  canJoin() { return this.members.size >= 2 ? 'こうかんは ふたりまでです' : null; }
  view(): TradeRoomView {
    return { code: this.code, kind: 'trade', hostId: this.hostId, members: this.memberViews(), phase: this.phase, offers: Object.fromEntries([...this.offers]) };
  }
  offer(c: Client, pokemon: OwnedPokemon | null) {
    if (this.phase !== 'offer') return;
    this.offers.set(c.player.id, { pokemon, confirmed: false });
    for (const o of this.offers.values()) o.confirmed = false; // any change resets confirmations
    this.touch(); this.sync();
  }
  confirm(c: Client, confirmed: boolean) {
    if (this.phase !== 'offer') return;
    const mine = this.offers.get(c.player.id);
    if (!mine?.pokemon) return this.send(c, { t: 'error', message: 'こうかんに だす ポケモンを えらんでください' });
    mine.confirmed = confirmed;
    const ids = [...this.members.keys()];
    if (ids.length === 2 && ids.every(id => this.offers.get(id)?.confirmed && this.offers.get(id)?.pokemon)) {
      const [a, b] = ids;
      const pa = this.offers.get(a)!.pokemon!, pb = this.offers.get(b)!.pokemon!;
      const ca = this.members.get(a)!.client, cb = this.members.get(b)!.client;
      this.phase = 'done';
      this.send(ca, { t: 'trade_done', received: pb, gaveUid: pa.uid, partner: cb.player });
      this.send(cb, { t: 'trade_done', received: pa, gaveUid: pb.uid, partner: ca.player });
    }
    this.touch(); this.sync();
  }
  remove(c: Client) { super.remove(c); this.offers.delete(c.player.id); for (const o of this.offers.values()) o.confirmed = false; this.sync(); }
}

// ---------------------------------------------------------------- hub (registry + message handling)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const sanitizePlayer = (p: Player): Player => ({ id: String(p?.id ?? '').slice(0, 40), name: String(p?.name || 'トレーナー').slice(0, 16), avatarSpeciesId: Number(p?.avatarSpeciesId) || 25 });

export class RoomHub {
  rooms = new Map<string, BattleRoom | TradeRoom>();
  newCode(): string { for (;;) { let c = ''; for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; if (!this.rooms.has(c)) return c; } }
  createRoom(host: Client, kind: 'battle' | 'trade', difficulty?: 1 | 2 | 3, bossSpeciesId?: number, code = this.newCode()) {
    const room = kind === 'battle' ? new BattleRoom(code, host, difficulty, bossSpeciesId) : new TradeRoom(code, host);
    this.rooms.set(code, room); return room;
  }
  getRoom(code: string) { return this.rooms.get(String(code).toUpperCase().trim()); }
  deleteIfEmpty(room: BattleRoom | TradeRoom) { if (room.empty) { room.dispose(); this.rooms.delete(room.code); } }
  sweep() { const now = Date.now(); for (const r of this.rooms.values()) if (r.empty || now - r.lastActivity > ROOM_TTL_MS) { r.dispose(); this.rooms.delete(r.code); } }
  get count() { return this.rooms.size; }

  private reply(c: Client, msg: ServerMsg) { if (c.conn.open) c.conn.send(JSON.stringify(msg)); }

  /** Handle one message from a connection. `client` is null until the connection said hello. Returns the (new) client. */
  handle(conn: Conn, client: Client | null, msg: ClientMsg, opts: { code?: string } = {}): Client | null {
    if (msg.t === 'ping') { conn.open && conn.send(JSON.stringify({ t: 'pong' } satisfies ServerMsg)); return client; }
    if (msg.t === 'hello') { const p = sanitizePlayer(msg.player); if (client) { client.player = p; return client; } return { conn, player: p, roomCode: null }; }
    if (!client) { conn.open && conn.send(JSON.stringify({ t: 'error', message: 'まず hello を おくってください' } satisfies ServerMsg)); return client; }
    const room = client.roomCode ? this.getRoom(client.roomCode) : undefined;
    switch (msg.t) {
      case 'create_room': {
        if (room) { room.remove(client); this.deleteIfEmpty(room); }
        const r = this.createRoom(client, msg.kind, msg.difficulty, msg.bossSpeciesId, opts.code);
        r.add(client); r.sync(); break;
      }
      case 'join_room': {
        const r = this.getRoom(msg.code);
        if (!r) { this.reply(client, { t: 'error', message: 'そのコードの へやは みつかりません' }); break; }
        if (room && room !== r) { room.remove(client); this.deleteIfEmpty(room); }
        if (r.members.has(client.player.id)) { r.members.get(client.player.id)!.client = client; client.roomCode = r.code; r.sync(); break; }
        const why = r.canJoin(); if (why) { this.reply(client, { t: 'error', message: why }); break; }
        r.add(client); r.sync(); break;
      }
      case 'leave_room': { if (room) { room.remove(client); this.deleteIfEmpty(room); } this.reply(client, { t: 'left' }); break; }
      case 'battle_select': { if (room instanceof BattleRoom) room.select(client, msg.pokemon); break; }
      case 'battle_start': { if (room instanceof BattleRoom) room.start(client); break; }
      case 'battle_action': { if (room instanceof BattleRoom) room.action(client, msg.moveId, msg.roulette, msg.special); break; }
      case 'catch_attempt': { if (room instanceof BattleRoom) room.catchAttempt(client, msg.ball); break; }
      case 'emote': { if (room) room.broadcast({ t: 'emote', playerId: client.player.id, playerName: client.player.name, emote: String(msg.emote).slice(0, 8) }); break; }
      case 'trade_offer': { if (room instanceof TradeRoom) room.offer(client, msg.pokemon); break; }
      case 'trade_confirm': { if (room instanceof TradeRoom) room.confirm(client, msg.confirmed); break; }
    }
    return client;
  }
  /** A connection went away. */
  disconnect(client: Client | null) {
    if (!client) return; const room = client.roomCode ? this.getRoom(client.roomCode) : undefined;
    if (room) { room.remove(client); this.deleteIfEmpty(room); }
  }
}
