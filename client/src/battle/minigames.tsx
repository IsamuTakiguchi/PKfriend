import { useEffect, useRef, useState } from 'react';
import { BALL_WHEEL, BALL_JA, type BallKind, type SpecialKind, SPECIAL_JA } from '@pkfriend/shared';
import { sfx } from '../audio';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const ROULETTE_NUMBERS = [3, 6, 2, 8, 4, 10, 5, 7]; // 10 is the red number

/**
 * こうげきルーレット: (1) ボタンを連打してパワーをためる → (2) まわる数字を ねらって とめる。
 * Result 1..10; the mash bonus (0..+3) is added, capped at 10.
 */
export function AttackRoulette({ title = 'こうげきルーレット！', onDone, tired = false }: { title?: string; onDone: (n: number) => void; tired?: boolean }) {
  const [phase, setPhase] = useState<'mash' | 'spin' | 'result'>('mash');
  const [mash, setMash] = useState(0);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [left, setLeft] = useState(2.2);
  const idxRef = useRef(0); const raf = useRef(0); const mashRef = useRef(0);

  // tired pokémon: the roulette does not spin (Frienda: つかれていると こうげきルーレットが はつどうしない)
  useEffect(() => { if (tired) { setPhase('result'); setResult(2); sfx.debuff(); const t = setTimeout(() => onDone(2), 1100); return () => clearTimeout(t); } }, [tired]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tired || phase !== 'mash') return;
    const t0 = performance.now();
    const tick = () => { const l = Math.max(0, 2.2 - (performance.now() - t0) / 1000); setLeft(l); if (l > 0) raf.current = requestAnimationFrame(tick); else setPhase('spin'); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase, tired]);

  useEffect(() => {
    if (phase !== 'spin') return;
    let last = performance.now(); const speed = 70 + Math.min(60, mashRef.current * 2);
    const tick = (t: number) => { if (t - last > speed) { last = t; idxRef.current = (idxRef.current + 1) % ROULETTE_NUMBERS.length; setIdx(idxRef.current); sfx.tick(); } raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase]);

  function hit() { if (phase !== 'mash') return; mashRef.current++; setMash(mashRef.current); if (mashRef.current % 4 === 0) sfx.click(); }
  async function stop() {
    if (phase !== 'spin') return;
    cancelAnimationFrame(raf.current);
    const base = ROULETTE_NUMBERS[idxRef.current];
    const bonus = Math.min(3, Math.floor(mashRef.current / 8));
    const n = Math.min(10, base + bonus);
    setResult(n); setPhase('result');
    if (n >= 10) sfx.crit(); else if (n >= 7) sfx.superEff(); else sfx.select();
    await sleep(1000); onDone(n);
  }
  const gauge = Math.min(1, mash / 24);
  return (
    <div className="mg-wrap" onPointerDown={phase === 'mash' ? hit : undefined}>
      <div className="mg-title">{title}</div>
      {tired ? <div className="mg-big" style={{ color: '#9aa0c3' }}>つかれている…<small>ルーレットが まわらない！</small></div> : (
        <>
          <div className="wheel">
            {ROULETTE_NUMBERS.map((n, i) => { const a = (i / ROULETTE_NUMBERS.length) * 360; return <div key={i} className={`seg ${i === idx && phase !== 'mash' ? 'on' : ''} ${n === 10 ? 'red' : ''}`} style={{ transform: `rotate(${a}deg) translateY(-92px) rotate(${-a}deg)` }}>{n}</div>; })}
            <div className="hub">{phase === 'result' ? result : phase === 'mash' ? Math.ceil(left) : '?'}</div>
          </div>
          {phase === 'mash' && <><div className="gauge"><i style={{ width: `${gauge * 100}%` }} /></div><button className="btn primary lg mg-btn">🔥 れんだ！ ×{mash}</button></>}
          {phase === 'spin' && <button className="btn gold lg mg-btn" onPointerDown={stop}>🎯 とめる！{mash >= 8 && <small>（れんだボーナス +{Math.min(3, Math.floor(mash / 8))}）</small>}</button>}
          {phase === 'result' && <div className={`mg-big ${result === 10 ? 'red' : ''}`}>{result}{result === 10 ? '！！' : ''}<small>{result! >= 8 ? 'すごい！ だいダメージ！' : result! >= 5 ? 'いいかんじ！' : 'うーん…'}</small></div>}
        </>
      )}
    </div>
  );
}

/** ボールルーレット: まわる ボールを ねらって とめる。 */
export function BallRoulette({ onDone, title = 'ボールルーレット！' }: { onDone: (b: BallKind) => void; title?: string }) {
  const [idx, setIdx] = useState(0); const [stopped, setStopped] = useState<BallKind | null>(null);
  const idxRef = useRef(0); const raf = useRef(0);
  useEffect(() => { if (stopped) return; let last = performance.now(); const tick = (t: number) => { if (t - last > 110) { last = t; idxRef.current = (idxRef.current + 1) % BALL_WHEEL.length; setIdx(idxRef.current); sfx.tick(); } raf.current = requestAnimationFrame(tick); }; raf.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf.current); }, [stopped]);
  async function stop() { if (stopped) return; cancelAnimationFrame(raf.current); const b = BALL_WHEEL[idxRef.current]; setStopped(b); if (b === 'master') sfx.crit(); else if (b === 'hyper') sfx.superEff(); else sfx.select(); await sleep(1100); onDone(b); }
  return (
    <div className="mg-wrap">
      <div className="mg-title">{title}</div>
      <div className="wheel">
        {BALL_WHEEL.map((b, i) => { const a = (i / BALL_WHEEL.length) * 360; return <div key={i} className={`seg ball-${b} ${i === idx ? 'on' : ''}`} style={{ transform: `rotate(${a}deg) translateY(-92px) rotate(${-a}deg)` }}><BallIcon kind={b} /></div>; })}
        <div className="hub">{stopped ? <BallIcon kind={stopped} size={40} /> : '?'}</div>
      </div>
      {!stopped ? <button className="btn gold lg mg-btn" onPointerDown={stop}>🎯 とめる！</button> : <div className="mg-big" style={{ fontSize: 22 }}>{BALL_JA[stopped]}！<small>{stopped === 'master' ? 'かならず つかまえられる！' : stopped === 'hyper' ? 'とても つかまえやすい！' : stopped === 'super' ? 'つかまえやすい！' : 'ふつうの ボール'}</small></div>}
    </div>
  );
}
export function BallIcon({ kind, size = 26 }: { kind: BallKind; size?: number }) {
  const top = { monster: '#ff3b30', super: '#3b82f6', hyper: '#111', master: '#7c3aed' }[kind];
  return <span className="ballicon" style={{ width: size, height: size, background: `linear-gradient(180deg, ${top} 0 46%, #111 46% 54%, #f4f4f8 54%)` }} />;
}

/** せんこうチャンス: あいての ほうが はやい！ 1.5秒 れんだして 線を あおに かえろう。 */
export function MashChance({ need = 12, onDone }: { need?: number; onDone: (won: boolean) => void }) {
  const [count, setCount] = useState(0); const [left, setLeft] = useState(1.6); const done = useRef(false); const cRef = useRef(0);
  useEffect(() => { const t0 = performance.now(); const id = setInterval(() => { const l = Math.max(0, 1.6 - (performance.now() - t0) / 1000); setLeft(l); if (l <= 0 && !done.current) { done.current = true; clearInterval(id); const won = cRef.current >= need; won ? sfx.superEff() : sfx.miss(); setTimeout(() => onDone(won), 700); } }, 50); return () => clearInterval(id); }, [need, onDone]);
  function hit() { if (done.current) return; cRef.current++; setCount(cRef.current); sfx.tick(); if (cRef.current >= need && !done.current) { done.current = true; sfx.superEff(); setTimeout(() => onDone(true), 600); } }
  const won = count >= need;
  return (
    <div className="mg-wrap" onPointerDown={hit}>
      <div className="mg-title">⚡ せんこうチャンス！</div>
      <div className="mg-big" style={{ color: won ? '#66e0ff' : '#ff5f6d' }}>{won ? 'せんこう ゲット！' : `${count} / ${need}`}<small>{won ? 'さきに こうげきできる！' : `れんだして 線を あおに かえろう！ ${left.toFixed(1)}s`}</small></div>
      <div className="gauge"><i style={{ width: `${Math.min(100, (count / need) * 100)}%`, background: won ? '#66e0ff' : '#ff5f6d' }} /></div>
      <button className="btn primary lg mg-btn">👆 れんだ！</button>
    </div>
  );
}

/** 〇〇チャンス (テラスタル / Zワザ / メガシンカ / タッグわざ / ダイマックス): 光るマークで とめる。 */
export function SpecialChance({ kind, onDone }: { kind: SpecialKind; onDone: (ok: boolean) => void }) {
  const N = 8; const target = 5;
  const [idx, setIdx] = useState(0); const [res, setRes] = useState<boolean | null>(null); const idxRef = useRef(0); const raf = useRef(0);
  useEffect(() => { if (res !== null) return; let last = performance.now(); const tick = (t: number) => { if (t - last > 95) { last = t; idxRef.current = (idxRef.current + 1) % N; setIdx(idxRef.current); sfx.tick(); } raf.current = requestAnimationFrame(tick); }; raf.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf.current); }, [res]);
  async function stop() { if (res !== null) return; cancelAnimationFrame(raf.current); const ok = idxRef.current === target || idxRef.current === (target + 1) % N; setRes(ok); ok ? sfx.cutin() : sfx.miss(); await sleep(ok ? 1200 : 800); onDone(ok); }
  const icon = { tera: '💎', z: '🌀', mega: '🧬', tag: '🤝', dyna: '🔺' }[kind];
  return (
    <div className="mg-wrap">
      <div className="mg-title">{icon} {SPECIAL_JA[kind]}チャンス！</div>
      <div className="wheel">
        {Array.from({ length: N }, (_, i) => { const a = (i / N) * 360; return <div key={i} className={`seg ${i === idx ? 'on' : ''} ${i === target ? 'glow' : ''}`} style={{ transform: `rotate(${a}deg) translateY(-92px) rotate(${-a}deg)` }}>{i === target ? icon : '・'}</div>; })}
        <div className="hub">{res === null ? '?' : res ? icon : '✕'}</div>
      </div>
      {res === null ? <button className="btn gold lg mg-btn" onPointerDown={stop}>✨ 光っている マークで とめる！</button> : <div className="mg-big">{res ? `${SPECIAL_JA[kind]} せいこう！` : 'しっぱい…'}<small>{res ? { tera: 'わざの いりょくが パワーアップ！', z: 'ぜんりょくの Zワザだ！', mega: 'こうげきが あがった！', tag: 'なかまと いっしょに こうげき！', dyna: 'きょだいな ちからが みなぎる！' }[kind] : 'ふつうの こうげきに なる'}</small></div>}
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
