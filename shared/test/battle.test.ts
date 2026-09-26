import { describe, it, expect } from 'vitest';
import { makeRng, getSpecies, wildBattler, newBattle, resolveRound, calcDamage, typeMultiplier, movesFor, createOwned, battlerFromOwned, rollCatch, catchChance, levelFromExp, expForLevel, evolveLevel, evolutionsOf, areaPool, AREAS, bossPool, aiChoose, bossActions } from '../src/index.js';

describe('type chart', () => {
  it('water beats fire, electric misses ground', () => {
    expect(typeMultiplier('water', ['fire'])).toBe(2);
    expect(typeMultiplier('electric', ['ground'])).toBe(0);
    expect(typeMultiplier('fire', ['grass', 'poison'])).toBe(2);
    expect(typeMultiplier('grass', ['grass', 'poison'])).toBe(0.25);
  });
});

describe('moves', () => {
  it('assigns up to 4 valid moves scaled by level', () => {
    const pika = getSpecies(25);
    const low = movesFor(pika.id, pika.types, 5);
    expect(low.length).toBeGreaterThan(0);
    expect(low.length).toBeLessThanOrEqual(4);
    expect(low).toContain('thunder-shock');
    expect(low).not.toContain('thunderbolt');
    const high = movesFor(pika.id, pika.types, 50);
    expect(high).toContain('thunder');
  });
});

describe('damage', () => {
  it('is deterministic with a seed and respects effectiveness', () => {
    const rng = makeRng(42);
    const squirtle = wildBattler(getSpecies(7), 20, rng);
    const charmander = wildBattler(getSpecies(4), 20, rng);
    const r = calcDamage(squirtle, charmander, 'water-gun', makeRng(1));
    expect(r.effectiveness).toBe(2);
    expect(r.stab).toBe(true);
    expect(r.damage).toBeGreaterThan(0);
    const r2 = calcDamage(squirtle, charmander, 'water-gun', makeRng(1));
    expect(r2.damage).toBe(r.damage);
  });
});

describe('round resolution', () => {
  it('runs a solo battle to completion', () => {
    const rng = makeRng(7);
    const ally = wildBattler(getSpecies(6), 40, rng); ally.side = 'ally'; ally.ownerId = 'me';
    const foe = wildBattler(getSpecies(1), 10, rng);
    const state = newBattle([ally], [foe]);
    let guard = 0;
    while (!state.finished && guard++ < 20) {
      const events = resolveRound(state, [{ battlerUid: ally.uid, moveId: 'flamethrower', targetUid: foe.uid }, { battlerUid: foe.uid, moveId: aiChoose(foe, ally, rng), targetUid: ally.uid }], rng);
      expect(events[0].kind).toBe('turn_start');
    }
    expect(state.finished).toBe(true);
    expect(state.winner).toBe('ally');
  });

  it('raid boss with several allies takes multiple actions and enrages', () => {
    const rng = makeRng(99);
    const allies = [4, 7, 1, 25].map(id => { const b = wildBattler(getSpecies(id), 30, rng); b.side = 'ally'; b.ownerId = 'p' + id; return b; });
    const boss = wildBattler(getSpecies(150), 40, rng, { boss: true, hpMultiplier: 3 });
    const state = newBattle(allies, [boss]);
    const acts = bossActions(state, rng);
    expect(acts.length).toBe(2);
    let enraged = false, guard = 0;
    while (!state.finished && guard++ < 60) {
      const allyActs = allies.filter(a => !a.fainted).map(a => ({ battlerUid: a.uid, moveId: a.moves[0], targetUid: boss.uid }));
      const ev = resolveRound(state, [...allyActs, ...bossActions(state, rng)], rng);
      if (ev.some((e: { kind: string }) => e.kind === 'boss_enrage')) enraged = true;
    }
    expect(state.finished).toBe(true);
    expect(enraged || state.winner === 'foe').toBe(true);
  });
});

describe('catch', () => {
  it('low hp + perfect timing gives higher chance', () => {
    const rng = makeRng(3);
    const foe = wildBattler(getSpecies(19), 5, rng);
    const full = catchChance(foe, 0);
    foe.hp = 1;
    const weak = catchChance(foe, 1);
    expect(weak).toBeGreaterThan(full);
    const r = rollCatch(foe, 1, makeRng(5));
    expect(r.shakes).toBeGreaterThanOrEqual(0);
    expect(r.shakes).toBeLessThanOrEqual(3);
  });
});

describe('progression', () => {
  it('levels and evolutions', () => {
    expect(levelFromExp(expForLevel(16))).toBe(16);
    expect(evolveLevel(4)).toBe(16);
    expect(evolveLevel(5)).toBe(36);
    expect(evolveLevel(6)).toBeNull();
    expect(evolutionsOf(133).length).toBe(3);
  });
  it('creates owned pokémon and battlers', () => {
    const p = createOwned({ speciesId: 25, level: 12, rng: makeRng(1), ownerId: 'me', ownerName: 'サトシ', origin: 'starter' });
    const b = battlerFromOwned(p, 'me', 'サトシ');
    expect(b.level).toBe(12);
    expect(b.hp).toBe(b.maxHp);
    expect(b.moves.length).toBeGreaterThan(0);
  });
  it('areas and bosses have pools', () => {
    for (const a of AREAS) expect(areaPool(a).length).toBeGreaterThan(5);
    expect(bossPool().length).toBeGreaterThan(10);
  });
});
