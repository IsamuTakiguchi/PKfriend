import type { Battler, BattleAction, BattleEvent, BattleState, OwnedPokemon, StatStages, Species, SpecialKind } from './types.js';
import { getMove } from './moves.js';
import { movesFor } from './moves.js';
import { calcStats, getSpecies, levelFromExp, displayName } from './species.js';
import { typeMultiplier } from './typechart.js';
import type { Rng } from './rng.js';

const zeroStages = (): StatStages => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
export const stageMul = (st: number) => (st >= 0 ? (2 + st) / 2 : 2 / (2 - st));

export function battlerFromOwned(p: OwnedPokemon, ownerId: string, ownerName: string, side: 'ally' | 'foe' = 'ally'): Battler {
  const s = getSpecies(p.speciesId);
  const level = levelFromExp(p.exp);
  const stats = calcStats(s.stats, p.ivs, level);
  return { uid: p.uid, speciesId: s.id, name: displayName(p), level, hp: stats.hp, maxHp: stats.hp, stats, moves: p.moves, shiny: p.shiny, ownerId, ownerName, side, stages: zeroStages(), fainted: false };
}

export function wildBattler(species: Species, level: number, rng: Rng, opts: { boss?: boolean; hpMultiplier?: number; shiny?: boolean; uid?: string } = {}): Battler {
  const iv = Math.floor(rng() * 32);
  const ivs = { hp: iv, atk: iv, def: iv, spa: iv, spd: iv, spe: iv };
  const stats = calcStats(species.stats, ivs, level);
  const maxHp = Math.floor(stats.hp * (opts.hpMultiplier ?? 1));
  return {
    uid: opts.uid ?? `wild_${species.id}_${Math.floor(rng() * 1e9).toString(36)}`, speciesId: species.id, name: species.ja, level, hp: maxHp, maxHp,
    stats: { ...stats, hp: maxHp }, moves: movesFor(species.id, species.types, level), shiny: opts.shiny ?? false,
    ownerId: 'wild', ownerName: opts.boss ? 'ボス' : 'やせい', side: 'foe', stages: zeroStages(), isBoss: opts.boss, fainted: false,
  };
}

export interface DamageResult { damage: number; effectiveness: number; crit: boolean; stab: boolean; }

export function calcDamage(attacker: Battler, defender: Battler, moveId: string, rng: Rng, multiplier = 1): DamageResult {
  const move = getMove(moveId);
  const atkS = getSpecies(attacker.speciesId), defS = getSpecies(defender.speciesId);
  const effectiveness = typeMultiplier(move.type, defS.types);
  if (move.power === 0 || effectiveness === 0) return { damage: 0, effectiveness, crit: false, stab: false };
  const phys = move.category === 'physical';
  const a = (phys ? attacker.stats.atk : attacker.stats.spa) * stageMul(phys ? attacker.stages.atk : attacker.stages.spa);
  const d = (phys ? defender.stats.def : defender.stats.spd) * stageMul(phys ? defender.stages.def : defender.stages.spd);
  const critChance = moveId === 'razor-leaf' || moveId === 'karate-chop' ? 1 / 4 : 1 / 16;
  const crit = rng() < critChance;
  const stab = atkS.types.includes(move.type);
  let dmg = Math.floor(Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * move.power * a) / d) / 50) + 2;
  dmg = Math.floor(dmg * (0.85 + rng() * 0.15));
  if (stab) dmg = Math.floor(dmg * 1.5);
  if (crit) dmg = Math.floor(dmg * 1.5);
  dmg = Math.floor(dmg * effectiveness);
  // bosses hit a bit softer so a raid party survives a few rounds
  if (attacker.isBoss) dmg = Math.floor(dmg * 0.6);
  dmg = Math.floor(dmg * multiplier);
  return { damage: Math.max(1, dmg), effectiveness, crit, stab };
}

const all = (s: BattleState) => [...s.allies, ...s.foes];
const find = (s: BattleState, uid: string) => all(s).find(b => b.uid === uid);
const alive = (arr: Battler[]) => arr.filter(b => !b.fainted);

function applyStage(target: Battler, stat: keyof StatStages, delta: number, events: BattleEvent[]) {
  const before = target.stages[stat];
  target.stages[stat] = Math.max(-6, Math.min(6, before + delta));
  if (target.stages[stat] !== before) events.push({ kind: 'stat_change', targetUid: target.uid, stat, delta });
}

/** Roulette number -> damage multiplier (5 = 1.0x, 10 = 2.0x). */
export const rouletteMultiplier = (n: number | undefined) => (n === undefined ? 1 : Math.max(0.2, n / 5));
export const SPECIAL_MULT: Record<SpecialKind, number> = { tera: 1.5, z: 2.0, mega: 1.5, tag: 1.0, dyna: 1.5 };

function useMove(state: BattleState, user: Battler, moveId: string, target: Battler, rng: Rng, events: BattleEvent[], flinched: Set<string>, action: Partial<BattleAction> = {}) {
  if (user.fainted || flinched.has(user.uid)) return;
  if (target.fainted) {
    const pool = alive(user.side === 'ally' ? state.foes : state.allies);
    if (!pool.length) return;
    target = pool[Math.floor(rng() * pool.length)];
  }
  const move = getMove(moveId);
  events.push({ kind: 'move_used', userUid: user.uid, targetUid: move.category === 'status' && move.effect !== 'atkDown' && move.effect !== 'defDown' ? user.uid : target.uid, moveId });
  if (rng() * 100 >= move.accuracy) { events.push({ kind: 'miss', userUid: user.uid, targetUid: target.uid }); return; }

  if (move.category === 'status') {
    switch (move.effect) {
      case 'heal': { const amt = Math.min(user.maxHp - user.hp, Math.floor(user.maxHp / 2)); user.hp += amt; events.push({ kind: 'heal', targetUid: user.uid, amount: amt, hpAfter: user.hp }); break; }
      case 'atkUp': applyStage(user, 'atk', 1, events); applyStage(user, 'spa', 1, events); break;
      case 'defUp': applyStage(user, 'def', 1, events); applyStage(user, 'spd', 1, events); break;
      case 'speUp': applyStage(user, 'spe', 1, events); break;
      case 'atkDown': applyStage(target, 'atk', -1, events); applyStage(target, 'spa', -1, events); break;
      case 'defDown': applyStage(target, 'def', -1, events); applyStage(target, 'spd', -1, events); break;
    }
    return;
  }

  let mult = rouletteMultiplier(action.roulette);
  if (action.special) { events.push({ kind: 'special', userUid: user.uid, special: action.special }); mult *= SPECIAL_MULT[action.special]; if (action.special === 'mega') { applyStage(user, 'atk', 1, events); applyStage(user, 'spa', 1, events); } }
  const partner = action.assistUid ? find(state, action.assistUid) : undefined;
  if (action.special === 'tag' && partner && !partner.fainted) mult += rouletteMultiplier(action.assistRoulette ?? 5) * 0.8;
  const r = calcDamage(user, target, moveId, rng, mult);
  const dmg = Math.min(target.hp, r.damage);
  target.hp -= dmg;
  events.push({ kind: 'damage', targetUid: target.uid, amount: dmg, hpAfter: target.hp, effectiveness: r.effectiveness, crit: r.crit, stab: r.stab });
  if (action.special === 'tag' && partner && !partner.fainted && target.hp > 0) {
    const pr = calcDamage(partner, target, partner.moves[0], rng, 0.6); const pd = Math.min(target.hp, pr.damage); target.hp -= pd;
    events.push({ kind: 'assist', userUid: user.uid, partnerUid: partner.uid, targetUid: target.uid, amount: pd, hpAfter: target.hp });
  }
  if (action.support && target.hp > 0 && dmg > 0) {
    const sd = Math.min(target.hp, Math.max(1, Math.floor(dmg * 0.35))); target.hp -= sd;
    events.push({ kind: 'support', speciesId: action.support.speciesId, name: action.support.name, targetUid: target.uid, amount: sd, hpAfter: target.hp });
  }
  if (r.damage > 0 && move.effect && rng() * 100 < (move.effectChance ?? 0)) {
    switch (move.effect) {
      case 'drain': { const amt = Math.min(user.maxHp - user.hp, Math.floor(dmg / 2)); if (amt > 0) { user.hp += amt; events.push({ kind: 'heal', targetUid: user.uid, amount: amt, hpAfter: user.hp }); } break; }
      case 'atkDown': applyStage(target, 'atk', -1, events); break;
      case 'defDown': if (moveId === 'close-combat') { applyStage(user, 'def', -1, events); applyStage(user, 'spd', -1, events); } else applyStage(target, 'def', -1, events); break;
      case 'flinch': if (!target.isBoss) flinched.add(target.uid); break;
    }
  }
  if (target.hp <= 0) { target.hp = 0; target.fainted = true; events.push({ kind: 'faint', targetUid: target.uid }); }
}

/** Boss picks its action(s): more participants => more actions per round. */
export function bossActions(state: BattleState, rng: Rng): BattleAction[] {
  const acts: BattleAction[] = [];
  for (const boss of alive(state.foes)) {
    const targets = alive(state.allies);
    if (!targets.length) break;
    const n = boss.isBoss ? Math.max(1, Math.ceil(targets.length / 2)) : 1;
    for (let i = 0; i < n; i++) {
      const t = targets[Math.floor(rng() * targets.length)];
      const damaging = boss.moves.filter(m => getMove(m).power > 0);
      const moveId = (damaging.length ? damaging : boss.moves)[Math.floor(rng() * (damaging.length || boss.moves.length))];
      acts.push({ battlerUid: boss.uid, moveId, targetUid: t.uid });
    }
  }
  return acts;
}

/** Wild team (3 vs 3): one wild pokémon attacks per round, with a modest random roulette number. */
export function wildActions(state: BattleState, rng: Rng, preferUid?: string, targetUid?: string): BattleAction[] {
  const wilds = alive(state.foes).filter(f => !f.isBoss); const targets = alive(state.allies);
  if (!wilds.length || !targets.length) return [];
  const w = wilds.find(x => x.uid === preferUid) ?? wilds[Math.floor(rng() * wilds.length)];
  const t = targets.find(x => x.uid === targetUid) ?? targets[Math.floor(rng() * targets.length)];
  return [{ battlerUid: w.uid, moveId: aiChoose(w, t, rng), targetUid: t.uid, roulette: 2 + Math.floor(rng() * 5) }];
}

/** Resolve one full round. Mutates state, returns ordered events for the client to animate. */
export function resolveRound(state: BattleState, actions: BattleAction[], rng: Rng): BattleEvent[] {
  const events: BattleEvent[] = [];
  state.turn += 1;
  events.push({ kind: 'turn_start', turn: state.turn });
  const flinched = new Set<string>();

  const ordered = actions
    .map(a => ({ a, b: find(state, a.battlerUid)!, m: getMove(a.moveId) }))
    .filter(x => x.b && !x.b.fainted)
    .sort((x, y) => {
      const p = ((y.m.priority ?? 0) + (y.a.initiative ?? 0)) - ((x.m.priority ?? 0) + (x.a.initiative ?? 0));
      if (p !== 0) return p;
      return y.b.stats.spe * stageMul(y.b.stages.spe) - x.b.stats.spe * stageMul(x.b.stages.spe) || rng() - 0.5;
    });

  let chain = 0;
  for (const { a, b } of ordered) {
    if (state.finished) break;
    const enemies = b.side === 'ally' ? state.foes : state.allies;
    let target = a.targetUid ? find(state, a.targetUid) : undefined;
    if (!target || (target.side === b.side && getMove(a.moveId).category !== 'status')) target = alive(enemies)[0];
    if (!target) break;
    const before = events.length;
    useMove(state, b, a.moveId, target, rng, events, flinched, a);
    const hit = events.slice(before).find(e => e.kind === 'damage') as Extract<BattleEvent, { kind: 'damage' }> | undefined;
    if (b.side === 'ally' && hit && hit.effectiveness >= 2) { chain++; if (chain >= 2) events.push({ kind: 'chain', count: chain }); } else if (b.side === 'ally') chain = 0;

    // boss enrage at 50% hp: attack up once
    for (const boss of state.foes) {
      if (boss.isBoss && !boss.fainted && boss.hp <= boss.maxHp / 2 && boss.stages.atk === 0) {
        events.push({ kind: 'boss_enrage', bossUid: boss.uid });
        applyStage(boss, 'atk', 1, events); applyStage(boss, 'spa', 1, events);
      }
    }
    if (!alive(state.foes).length) { state.finished = true; state.winner = 'ally'; events.push({ kind: 'battle_end', winner: 'ally' }); }
    else if (!alive(state.allies).length) { state.finished = true; state.winner = 'foe'; events.push({ kind: 'battle_end', winner: 'foe' }); }
  }
  return events;
}

export function newBattle(allies: Battler[], foes: Battler[]): BattleState {
  return { turn: 0, allies, foes, finished: false, winner: null };
}

/** Simple AI for solo wild battles: prefer super effective damaging moves. */
export function aiChoose(user: Battler, target: Battler, rng: Rng): string {
  const defTypes = getSpecies(target.speciesId).types;
  const scored = user.moves.map(id => {
    const m = getMove(id);
    if (m.power === 0) return { id, score: user.hp < user.maxHp / 3 && m.effect === 'heal' ? 200 : 10 + rng() * 20 };
    return { id, score: m.power * typeMultiplier(m.type, defTypes) * (m.accuracy / 100) * (0.8 + rng() * 0.4) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].id;
}
