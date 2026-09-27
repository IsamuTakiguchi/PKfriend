import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BALL_JA, type BallKind, type SpecialKind, SPECIAL_JA } from '@pkfriend/shared';
import { sfx } from '../audio';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const ROULETTE_NUMBERS = [1, 5, 2, 8, 3, 10, 4, 6, 7, 9]; // 10 is the red number
export const BALL_WHEEL_ITEMS: BallKind[] = ['monster', 'super', 'monster', 'hyper', 'monster', 'super', 'master', 'monster', 'super', 'hyper'];

// ------------------------------------------------------------------ big rotating wheel (only the top part is on screen)
/**
 * A large disc whose top is visible; the disc itself spins and a fixed pointer at the top picks the segment.
 * `stopSignal` > 0 starts the deceleration; onStopped fires with the index under the pointer.
 */
function BigWheel<T>({ items, render, spinSpeed = 260, stopSignal, onStopped, className = '' }: { items: T[]; render: (item: T, i: number, selected: boolean) => ReactNode; spinSpeed?: number; stopSignal: number; onStopped: (index: number) => void; className?: string }) {
  const [angle, setAngle] = useState(0); const [selected, setSelected] = useState<number | null>(null);
  const angleRef = useRef(0); const raf = useRef(0); const stopping = useRef(false); const done = useRef(false);
  const N = items.length; const step = 360 / N;
  const indexAt = (a: number) => (((Math.round((-a % 360 + 360) % 360 / step)) % N) + N) % N;
  useEffect(() => {
    let last = performance.now(); let vel = spinSpeed;
    let target: number | null = null;
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (stopping.current && target === null) { // pick a landing angle 2-3 turns ahead, aligned to a segment centre
        const extra = 720 + Math.random() * 360; const raw = angleRef.current + extra;
        target = Math.round(raw / step) * step;
      }
      if (target !== null) {
        const remain = target - angleRef.current;
        if (remain <= 0.5) { angleRef.current = target; setAngle(target); if (!done.current) { done.current = true; const idx = indexAt(target); setSelected(idx); onStopped(idx); } return; }
        vel = Math.max(40, remain * 2.2);
      }
      const before = indexAt(angleRef.current);
      angleRef.current += vel * dt; setAngle(angleRef.current);
      if (indexAt(angleRef.current) !== before) sfx.tick();
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (stopSignal > 0) stopping.current = true; }, [stopSignal]);
  const cur = indexAt(angleRef.current);
  return (
    <div className={`bigwheel-wrap ${className}`}>
      <div className="bigwheel-pointer">▼</div>
      <div className="bigwheel" style={{ transform: `rotate(${angle}deg)` }}>
        {items.map((it, i) => <div key={i} className={`bw-seg ${(selected ?? cur) === i ? 'on' : ''} ${selected === i ? 'final' : ''}`} style={{ transform: `rotate(${i * step}deg)` }}><div className="bw-inner">{render(it, i, selected === i)}</div></div>)}
        <div className="bw-hub" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ こうげきルーレット → ボタン連打（おうえん）
/**
 * Frienda order: (special chance first, handled by the caller) → the wheel spins, stop it → mash both buttons to cheer.
 * Result: roulette number (+1 when powered) plus a mash bonus of up to +3.
 */
export function AttackRoulette({ title = 'こうげきルーレット！', onDone, tired = false, powered = false }: { title?: string; onDone: (n: number) => void; tired?: boolean; powered?: boolean }) {
  const [phase, setPhase] = useState<'spin' | 'mash' | 'result'>('spin');
  const [stopSig, setStopSig] = useState(0);
  const [num, setNum] = useState<number | null>(null);
  const [mash, setMash] = useState(0); const mashRef = useRef(0); const lastSide = useRef<'L' | 'R' | null>(null);
  const [left, setLeft] = useState(2.6);
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => { if (tired) { setPhase('result'); setResult(2); sfx.debuff(); const t = setTimeout(() => onDone(2), 1300); return () => clearTimeout(t); } }, [tired]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== 'mash') return;
    const t0 = performance.now();
    const id = setInterval(() => { const l = Math.max(0, 2.6 - (performance.now() - t0) / 1000); setLeft(l); if (l <= 0) { clearInterval(id); finish(); } }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function stopped(idx: number) {
    const base = ROULETTE_NUMBERS[idx] + (powered ? 1 : 0);
    setNum(base);
    if (base >= 10) sfx.crit(); else if (base >= 7) sfx.superEff(); else sfx.select();
    setTimeout(() => setPhase('mash'), 900);
  }
  function hit(side: 'L' | 'R') {
    if (phase !== 'mash') return;
    mashRef.current += lastSide.current && lastSide.current !== side ? 1.5 : 1; lastSide.current = side; // alternating is worth more
    setMash(Math.floor(mashRef.current)); if (Math.floor(mashRef.current) % 5 === 0) sfx.click();
  }
  async function finish() {
    const bonus = Math.min(3, Math.floor(mashRef.current / 12));
    const n = Math.min(13, (num ?? 5) + bonus);
    setResult(n); setPhase('result');
    if (n >= 10) sfx.crit(); else sfx.superEff();
    await sleep(1100); onDone(n);
  }
  const gauge = Math.min(1, mash / 36);
  return (
    <div className="mg-wrap">
      <div className="mg-title">{title}{powered && <small style={{ display: 'block', fontSize: 12, color: '#ffd54a' }}>パワーアップ中！ 虹色の数字を ねらえ</small>}</div>
      {tired ? <div className="mg-big" style={{ color: '#9aa0c3' }}>つかれている…<small>ルーレットが まわらない！</small></div> : (
        <>
          {phase === 'spin' && <>
            <BigWheel items={ROULETTE_NUMBERS} stopSignal={stopSig} onStopped={stopped} render={(n, _i, sel) => <span className={`bw-num ${n === 10 ? (powered ? 'rainbow' : 'red') : ''} ${sel ? 'sel' : ''}`}>{n + (powered ? 1 : 0)}</span>} />
            <button className="btn gold lg mg-btn" disabled={stopSig > 0} onPointerDown={() => { if (!stopSig) { sfx.click(); setStopSig(1); } }}>🎯 ストップ！</button>
            {num !== null && <div className={`mg-big ${num >= 10 ? 'red' : ''}`}>{num}</div>}
          </>}
          {phase === 'mash' && <>
            <div className={`mg-big ${(num ?? 0) >= 10 ? 'red' : ''}`} style={{ fontSize: 40 }}>{num}<small>わざを くりだすぞ！ 両はしの ボタンを れんだで おうえん！ {left.toFixed(1)}s</small></div>
            <div className="gauge"><i style={{ width: `${gauge * 100}%` }} /></div>
            <div className="mash-row">
              <button className="mash-btn" onPointerDown={() => hit('L')}>L<small>れんだ</small></button>
              <div className="mash-count">×{mash}{mash >= 12 && <small>+{Math.min(3, Math.floor(mash / 12))}</small>}</div>
              <button className="mash-btn" onPointerDown={() => hit('R')}>R<small>れんだ</small></button>
            </div>
          </>}
          {phase === 'result' && <div className={`mg-big ${(result ?? 0) >= 10 ? 'red' : ''}`}>{result}{(result ?? 0) >= 10 ? '！！' : ''}<small>{(result ?? 0) >= 9 ? 'すごい！ だいダメージ！' : (result ?? 0) >= 5 ? 'いいかんじ！' : 'うーん…'}</small></div>}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ボールルーレット: 円盤が回る。ボールを つかんで 上に はじいて なげる（ドラッグのみ）
export function BallRoulette({ onDone, title = 'ボールルーレット！' }: { onDone: (b: BallKind) => void; title?: string }) {
  const [stopSig, setStopSig] = useState(0); const [stopped, setStopped] = useState<BallKind | null>(null); const [thrown, setThrown] = useState(false);
  const drag = useRef<{ x: number; y: number; t: number; id: number } | null>(null); const [pos, setPos] = useState({ x: 0, y: 0 });
  async function done(idx: number) { const b = BALL_WHEEL_ITEMS[idx]; setStopped(b); if (b === 'master') sfx.crit(); else if (b === 'hyper') sfx.superEff(); else sfx.select(); await sleep(1000); onDone(b); }
  // drag handling: window-level listeners so the gesture survives leaving the element (and pointer capture failures)
  const stopRef = useRef(stopSig); stopRef.current = stopSig;
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (stopRef.current) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    drag.current = start; setPos({ x: 0, y: 0 }); sfx.click();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not all browsers allow capture for touch pointers */ }
    const onMove = (ev: PointerEvent) => { if (!drag.current) return; ev.preventDefault(); setPos({ x: ev.clientX - start.x, y: Math.min(0, ev.clientY - start.y) }); };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      if (!drag.current) return; drag.current = null;
      const dy = ev.clientY - start.y; const dt = Math.max(1, performance.now() - start.t);
      if (!stopRef.current && (dy < -60 || (dy < -25 && -dy / dt > 0.35))) { setThrown(true); setPos({ x: 0, y: -260 }); sfx.throwBall(); setStopSig(1); }
      else setPos({ x: 0, y: 0 });
    };
    window.addEventListener('pointermove', onMove, { passive: false }); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  }
  return (
    <div className="mg-wrap ballgame">
      <div className="mg-title">{title}</div>
      <BigWheel items={BALL_WHEEL_ITEMS} spinSpeed={200} stopSignal={stopSig} onStopped={done} render={(b, _i, sel) => <BallIcon kind={b} size={sel ? 44 : 34} />} className="ballwheel" />
      {!stopped ? (
        <div className="throw-zone">
          <div className="throw-arrow">⬆</div>
          <div className={`throw-ball ${thrown ? 'flying' : ''}`} style={{ transform: `translate(${pos.x * 0.4}px, ${pos.y}px) scale(${1 - pos.y / 900})` }} onPointerDown={down}>
            <BallIcon kind="monster" size={72} />
          </div>
          <small>{thrown ? 'なげた！' : 'ボールを つかんで 上に はじこう！'}</small>
        </div>
      ) : <div className="mg-big" style={{ fontSize: 22 }}>{BALL_JA[stopped]}！<small>{stopped === 'master' ? 'かならず つかまえられる！' : stopped === 'hyper' ? 'とても つかまえやすい！' : stopped === 'super' ? 'つかまえやすい！' : 'ふつうの ボール'}</small></div>}
    </div>
  );
}
export function BallIcon({ kind, size = 26 }: { kind: BallKind; size?: number }) {
  const top = { monster: '#ff3b30', super: '#3b82f6', hyper: '#111', master: '#7c3aed' }[kind];
  return <span className="ballicon" style={{ width: size, height: size, background: `linear-gradient(180deg, ${top} 0 46%, #111 46% 54%, #f4f4f8 54%)` }} />;
}

// ------------------------------------------------------------------ せんこうチャンス: 両はしの ボタンを れんだして 線を あおに
export function MashChance({ need = 14, onDone }: { need?: number; onDone: (won: boolean) => void }) {
  const [count, setCount] = useState(0); const [left, setLeft] = useState(1.8); const done = useRef(false); const cRef = useRef(0);
  useEffect(() => { const t0 = performance.now(); const id = setInterval(() => { const l = Math.max(0, 1.8 - (performance.now() - t0) / 1000); setLeft(l); if (l <= 0 && !done.current) { done.current = true; clearInterval(id); const won = cRef.current >= need; won ? sfx.superEff() : sfx.miss(); setTimeout(() => onDone(won), 700); } }, 50); return () => clearInterval(id); }, [need, onDone]);
  function hit() { if (done.current) return; cRef.current++; setCount(cRef.current); sfx.tick(); if (cRef.current >= need) { done.current = true; sfx.superEff(); setTimeout(() => onDone(true), 600); } }
  const won = count >= need;
  return (
    <div className="mg-wrap">
      <div className="mg-title">⚡ せんこうチャンス！</div>
      <div className="mg-big" style={{ color: won ? '#66e0ff' : '#ff5f6d' }}>{won ? 'せんこう ゲット！' : `${count} / ${need}`}<small>{won ? 'さきに こうげきできる！' : `れんだして 線を あおに かえろう！ ${left.toFixed(1)}s`}</small></div>
      <div className="gauge"><i style={{ width: `${Math.min(100, (count / need) * 100)}%`, background: won ? '#66e0ff' : '#ff5f6d' }} /></div>
      <div className="mash-row"><button className="mash-btn" onPointerDown={hit}>L<small>れんだ</small></button><div className="mash-count">×{count}</div><button className="mash-btn" onPointerDown={hit}>R<small>れんだ</small></button></div>
    </div>
  );
}

// ------------------------------------------------------------------ 特殊チャンス
/** メガシンカ / ダイマックス: 上から流れてくる マークを 5回 つづけて タッチ。 */
export function FallingMarks({ kind, onDone }: { kind: SpecialKind; onDone: (ok: boolean) => void }) {
  const icon = { tera: '💎', z: '🌀', mega: '🧬', tag: '🤝', dyna: '🔺' }[kind];
  const [marks, setMarks] = useState<{ id: number; x: number; born: number; hit?: boolean }[]>([]);
  const [streak, setStreak] = useState(0); const [res, setRes] = useState<boolean | null>(null);
  const seq = useRef(0); const streakRef = useRef(0); const over = useRef(false);
  useEffect(() => {
    const spawn = setInterval(() => { if (over.current) return; setMarks(m => [...m.filter(x => performance.now() - x.born < 2600), { id: ++seq.current, x: 12 + Math.random() * 76, born: performance.now() }]); }, 620);
    const judge = setInterval(() => { setMarks(m => { const now = performance.now(); const missed = m.some(x => !x.hit && now - x.born > 1900 && now - x.born < 1960); if (missed && !over.current) { streakRef.current = 0; setStreak(0); sfx.miss(); } return m; }); }, 40);
    const timeout = setTimeout(() => { if (!over.current) { over.current = true; setRes(false); sfx.miss(); setTimeout(() => onDone(false), 900); } }, 9000);
    return () => { clearInterval(spawn); clearInterval(judge); clearTimeout(timeout); };
  }, [onDone]);
  function tap(id: number) {
    if (over.current) return;
    setMarks(m => m.map(x => x.id === id ? { ...x, hit: true } : x));
    streakRef.current++; setStreak(streakRef.current); sfx.select();
    if (streakRef.current >= 5) { over.current = true; setRes(true); sfx.cutin(); setTimeout(() => onDone(true), 1200); }
  }
  return (
    <div className="mg-wrap falling">
      <div className="mg-title">{icon} {SPECIAL_JA[kind]}チャンス！</div>
      <div className="mg-sub">上から ながれてくる マークを <b>5回 つづけて</b> タッチ！</div>
      <div className="fall-area">
        {marks.map(m => !m.hit && <button key={m.id} className="fall-mark" style={{ left: `${m.x}%` }} onPointerDown={() => tap(m.id)}>{icon}</button>)}
      </div>
      <div className="streak">{Array.from({ length: 5 }, (_, i) => <span key={i} className={i < streak ? 'on' : ''}>{icon}</span>)}</div>
      {res !== null && <div className="mg-big">{res ? `${SPECIAL_JA[kind]} せいこう！` : 'しっぱい…'}<small>{res ? 'こうげきルーレットが パワーアップ！' : 'ふつうの こうげきに なる'}</small></div>}
    </div>
  );
}

/** テラスタル / Zワザ / タッグわざ: 光るマークで ルーレットを とめる。 */
export function SpecialChance({ kind, onDone }: { kind: SpecialKind; onDone: (ok: boolean) => void }) {
  if (kind === 'mega' || kind === 'dyna') return <FallingMarks kind={kind} onDone={onDone} />;
  return <AimChance kind={kind} onDone={onDone} />;
}
function AimChance({ kind, onDone }: { kind: SpecialKind; onDone: (ok: boolean) => void }) {
  const icon = { tera: '💎', z: '🌀', mega: '🧬', tag: '🤝', dyna: '🔺' }[kind];
  const items = Array.from({ length: 10 }, (_, i) => (i === 4 || i === 5 ? icon : '・'));
  const [stopSig, setStopSig] = useState(0); const [res, setRes] = useState<boolean | null>(null);
  async function stopped(idx: number) { const ok = items[idx] === icon; setRes(ok); ok ? sfx.cutin() : sfx.miss(); await sleep(ok ? 1200 : 800); onDone(ok); }
  return (
    <div className="mg-wrap">
      <div className="mg-title">{icon} {SPECIAL_JA[kind]}チャンス！</div>
      <BigWheel items={items} spinSpeed={230} stopSignal={stopSig} onStopped={stopped} render={(it, _i, sel) => <span className={`bw-num ${it === icon ? 'glow' : ''} ${sel ? 'sel' : ''}`}>{it}</span>} />
      {res === null ? <button className="btn gold lg mg-btn" disabled={stopSig > 0} onPointerDown={() => { if (!stopSig) setStopSig(1); }}>✨ 光っている マークで とめる！</button> : <div className="mg-big">{res ? `${SPECIAL_JA[kind]} せいこう！` : 'しっぱい…'}<small>{res ? { tera: 'わざの いりょくが パワーアップ！', z: 'ぜんりょくの Zワザだ！', mega: 'こうげきが あがった！', tag: 'なかまと いっしょに こうげき！', dyna: 'きょだいな ちからが みなぎる！' }[kind] : 'ふつうの こうげきに なる'}</small></div>}
    </div>
  );
}

/** ついげきチャンス (サポートポケモン): タイミングよく タップ！ */
export function FollowUpChance({ name, onDone }: { name: string; onDone: (ok: boolean) => void }) {
  const [pos, setPos] = useState(0); const [res, setRes] = useState<boolean | null>(null); const raf = useRef(0); const t0 = useRef(performance.now());
  useEffect(() => { if (res !== null) return; const tick = (t: number) => { setPos(((t - t0.current) / 1400) % 1); raf.current = requestAnimationFrame(tick); }; raf.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf.current); }, [res]);
  async function stop() { if (res !== null) return; cancelAnimationFrame(raf.current); const ok = pos > 0.6 && pos < 0.85; setRes(ok); ok ? sfx.superEff() : sfx.miss(); await sleep(700); onDone(ok); }
  return (
    <div className="mg-wrap" onPointerDown={stop}>
      <div className="mg-title">🐾 ついげきチャンス！ {name}</div>
      <div className="bar-track"><div className="bar-good" style={{ left: '60%', width: '25%' }} /><div className="bar-cursor" style={{ left: `${pos * 100}%` }} /></div>
      <div className="mg-big" style={{ fontSize: 20 }}>{res === null ? 'みどりの ゾーンで タップ！' : res ? 'ついげき アタック！' : 'まにあわなかった…'}</div>
    </div>
  );
}
