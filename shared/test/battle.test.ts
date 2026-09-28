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

describe('frienda rules', () => {
  it('roulette number scales damage (10 = 2x of 5)', async () => {
    const m = await import('../src/index.js');
    const rng = m.makeRng(11);
    const a = m.wildBattler(m.getSpecies(6), 40, rng); const d = m.wildBattler(m.getSpecies(1), 30, rng);
    const lo = m.calcDamage(a, d, 'flamethrower', m.makeRng(2), m.rouletteMultiplier(5)).damage;
    const hi = m.calcDamage(a, d, 'flamethrower', m.makeRng(2), m.rouletteMultiplier(10)).damage;
    expect(hi).toBeGreaterThan(lo * 1.8);
    expect(m.rouletteMultiplier(undefined)).toBe(1);
  });
  it('wild team attacks once per round, initiative can override speed, tag adds an assist hit', async () => {
    const m = await import('../src/index.js');
    const rng = m.makeRng(5);
    const allies = [4, 7, 1].map(id => { const b = m.wildBattler(m.getSpecies(id), 20, rng); b.side = 'ally'; b.ownerId = 'me'; return b; });
    const foes = [19, 16, 10].map(id => m.wildBattler(m.getSpecies(id), 12, rng));
    const state = m.newBattle(allies, foes);
    const wa = m.wildActions(state, rng, foes[1].uid);
    expect(wa.length).toBe(1); expect(wa[0].battlerUid).toBe(foes[1].uid);
    const slow = allies[2]; slow.stats.spe = 1; const fast = foes[0]; fast.stats.spe = 200;
    const ev = m.resolveRound(state, [{ battlerUid: slow.uid, moveId: slow.moves[0], targetUid: fast.uid, roulette: 8, initiative: 5, special: 'tag', assistUid: allies[0].uid, assistRoulette: 6 }, { battlerUid: fast.uid, moveId: fast.moves[0], targetUid: slow.uid, roulette: 4 }], rng);
    const order = ev.filter(e => e.kind === 'move_used').map(e => (e as { userUid: string }).userUid);
    expect(order[0]).toBe(slow.uid);
    expect(ev.some(e => e.kind === 'special')).toBe(true);
    // the transformation is shown before the attack
    expect(ev.findIndex(e => e.kind === 'special')).toBeLessThan(ev.findIndex(e => e.kind === 'move_used' && e.userUid === slow.uid));
    expect(ev.some(e => e.kind === 'assist') || fast.fainted).toBe(true);
  });
  it('ball roulette: master ball always catches, better ball wins', async () => {
    const m = await import('../src/index.js');
    const rng = m.makeRng(9);
    const t = m.wildBattler(m.getSpecies(150), 50, rng);
    expect(m.rollCatchBall(t, 'master', rng).success).toBe(true);
    const t2 = m.wildBattler(m.getSpecies(16), 10, rng); t2.hp = Math.floor(t2.maxHp / 2);
    expect(m.catchChanceBall(t2, 'hyper')).toBeGreaterThan(m.catchChanceBall(t2, 'monster'));
    expect(m.bestBall(['monster', 'hyper', 'super'])).toBe('hyper');
  });
  it('special chances transform the pokémon: mega beyond the evolution limit, tera crystal, dynamax / gigantamax', async () => {
    const m = await import('../src/index');
    expect(m.megaForm(4, 0)).toMatchObject({ kind: 'mega', spriteId: 10034, realForm: true });   // ヒトカゲ -> メガリザードンX
    expect(m.megaForm(6, 1).spriteId).toBe(10035);                                                  // リザードン -> メガリザードンY
    expect(m.megaForm(25, 0)).toMatchObject({ spriteId: 26, name: 'メガライチュウ', realForm: false }); // no mega in the line
    expect(m.megaForm(129, 0).name).toBe('メガギャラドス');                                         // コイキング -> メガギャラドス
    expect(m.dynaForm(25)).toMatchObject({ spriteId: 10199, realForm: true });                      // キョダイマックスピカチュウ
    expect(m.dynaForm(4)).toMatchObject({ spriteId: 4, realForm: false });
    expect(m.teraForm(25, 'water')).toMatchObject({ kind: 'tera', teraType: 'water', spriteId: 25 });
    expect(m.formFor('z', 25, 0, 'electric')).toBeNull();
    const counts: Record<string, number> = {}; for (let i = 0; i < 1000; i++) { const k = m.markFromRoll(i / 1000); counts[k] = (counts[k] ?? 0) + 1; }
    expect(counts.mega + counts.tera + counts.dyna).toBeGreaterThan(700);
  });

  it('picks have grades, marks and a main move; trainers and exchange offers are generated', async () => {
    const m = await import('../src/index.js');
    expect(m.gradeOf(150)).toBe(5); expect(m.gradeOf(19)).toBe(2);
    const rng = m.makeRng(1); let marks = 0;
    for (let i = 0; i < 50; i++) { const p = m.createOwned({ speciesId: 25, level: 10, rng, ownerId: 'a', ownerName: 'A', origin: 'wild' }); if (p.mark) marks++; expect(m.mainMove(p)).toBe(p.moves[0]); }
    expect(marks).toBeGreaterThan(3);
    const tr = m.makeTrainer(m.AREAS[0], 10, rng); expect(tr.speciesIds.length).toBe(3);
    expect(m.gradeOf(m.exchangeOffer(19, 10, rng))).toBeGreaterThanOrEqual(3);
  });
});
