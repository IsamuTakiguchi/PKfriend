import type { WebSocket } from 'ws';
import {
  type Player, type OwnedPokemon, type Battler, type BattleState, type BattleAction, type BattleEvent,
  type BattleRoomView, type TradeRoomView, type RoomMember, type ServerMsg,
  makeRng, randomSeed, getSpecies, wildBattler, battlerFromOwned, newBattle, resolveRound, bossActions,
  rollCatch, createOwned, expGain, bossPool, pick, ROUND_SECONDS, MAX_RAID_MEMBERS,
} from '@pkfriend/shared';

export interface Client { ws: WebSocket; player: Player; roomCode: string | null; }

const ROOM_TTL_MS = 30 * 60 * 1000;

abstract class Room {
  code: string; hostId: string; members = new Map<string, { client: Client; ready: boolean }>(); lastActivity = Date.now();
  constructor(code: string, host: Client) { this.code = code; this.hostId = host.player.id; }
  abstract kind: 'battle' | 'trade';
  abstract view(): BattleRoomView | TradeRoomView;
  touch() { this.lastActivity = Date.now(); }
  memberViews(): RoomMember[] { return [...this.members.values()].map(m => ({ player: m.client.player, ready: m.ready, connected: m.client.ws.readyState === 1 })); }
  send(c: Client, msg: ServerMsg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }
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
      difficulty: this.difficulty, state: this.state, pendingUids: this.pendingUids(), roundDeadline: this.roundDeadline, catchResults: this.catchResults, expGain: this.expGainValue,
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

  action(c: Client, moveId: string) {
    if (this.phase !== 'battle' || !this.state) return;
    const b = this.state.allies.find(a => a.ownerId === c.player.id && !a.fainted);
    if (!b) return;
    if (!b.moves.includes(moveId)) return this.send(c, { t: 'error', message: 'そのわざは つかえません' });
    this.actions.set(b.uid, { battlerUid: b.uid, moveId, targetUid: this.boss!.uid });
    this.touch();
    if (this.pendingUids().length === 0) this.resolve();
    else this.sync();
  }

  private resolve() {
    if (this.phase !== 'battle' || !this.state) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    // auto-pick for anyone who didn't choose
    for (const a of this.state.allies) if (!a.fainted && !this.actions.has(a.uid)) this.actions.set(a.uid, { battlerUid: a.uid, moveId: pick(this.rng, a.moves), targetUid: this.boss!.uid });
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

  catchAttempt(c: Client, timing: number) {
    if (this.phase !== 'catch' || !this.boss) return;
    if (this.catchResults[c.player.id]) return;
    const participated = this.state!.allies.some(a => a.ownerId === c.player.id);
    if (!participated) return this.send(c, { t: 'error', message: 'バトルに さんかしていません' });
    const t = Math.max(0, Math.min(1, Number(timing) || 0));
    const r = rollCatch(this.boss, t, this.rng, { bonus: 0.5 * this.difficulty });
    let pokemon: OwnedPokemon | undefined;
    if (r.success) pokemon = createOwned({ speciesId: this.boss.speciesId, level: this.boss.level, rng: this.rng, ownerId: c.player.id, ownerName: c.player.name, origin: 'raid', shiny: this.boss.shiny });
    this.catchResults[c.player.id] = { success: r.success, shakes: r.shakes, pokemon };
    this.broadcast({ t: 'catch_result', playerId: c.player.id, success: r.success, shakes: r.shakes, pokemon });
    const participants = new Set(this.state!.allies.map(a => a.ownerId));
    if ([...participants].every(pid => this.catchResults[pid] || !this.members.has(pid))) this.phase = 'done';
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
  dispose() { if (this.timer) clearTimeout(this.timer); }
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

// ---------------------------------------------------------------- registry
const rooms = new Map<string, BattleRoom | TradeRoom>();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode(): string {
  for (;;) { let c = ''; for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; if (!rooms.has(c)) return c; }
}
export function createRoom(host: Client, kind: 'battle' | 'trade', difficulty?: 1 | 2 | 3, bossSpeciesId?: number) {
  const code = newCode();
  const room = kind === 'battle' ? new BattleRoom(code, host, difficulty, bossSpeciesId) : new TradeRoom(code, host);
  rooms.set(code, room);
  return room;
}
export const getRoom = (code: string) => rooms.get(code.toUpperCase().trim());
export function deleteIfEmpty(room: Room) { if (room.empty) { room.dispose(); rooms.delete(room.code); } }
export function sweepRooms() { const now = Date.now(); for (const r of rooms.values()) if (r.empty || now - r.lastActivity > ROOM_TTL_MS) { r.dispose(); rooms.delete(r.code); } }
export const roomCount = () => rooms.size;
