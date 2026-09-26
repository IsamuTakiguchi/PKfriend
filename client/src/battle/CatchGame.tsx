import { useEffect, useRef, useState } from 'react';
import type { Battler } from '@pkfriend/shared';
import type { StageApi } from './stage';
import { sfx } from '../audio';
import { Confetti } from '../components/ui';

/**
 * Timing ring mini-game -> ball throw -> shakes -> result.
 * `onThrow` resolves the catch (locally or via server) and returns shakes/success.
 */
export function CatchGame({ api, target, ballsLeft, onThrow, onDone }: {
  api: StageApi; target: Battler; ballsLeft: number;
  onThrow: (timing: number) => Promise<{ success: boolean; shakes: number }>;
  onDone: (success: boolean) => void;
}) {
  const [phase, setPhase] = useState<'aim' | 'throw' | 'result'>('aim');
  const [ring, setRing] = useState(1);            // 1 (outer) -> 0
  const [ballCls, setBallCls] = useState('');
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [lastTiming, setLastTiming] = useState<number | null>(null);
  const raf = useRef(0); const t0 = useRef(performance.now()); const ringRef = useRef(1);
  const GOOD = 0.42, GOOD_W = 0.16; // sweet spot centre and half-width (as fraction of outer ring)

  useEffect(() => {
    if (phase !== 'aim') return;
    t0.current = performance.now();
    const loop = (t: number) => { const k = ((t - t0.current) / 1600) % 1; const r = 1 - k; ringRef.current = r; setRing(r); raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [phase]);

  async function throwBall() {
    if (phase !== 'aim') return;
    cancelAnimationFrame(raf.current);
    const r = ringRef.current;
    const timing = Math.max(0, 1 - Math.abs(r - GOOD) / GOOD_W);   // 1 perfect .. 0 outside band
    setLastTiming(timing);
    setPhase('throw');
    const tp = api.posOf(target.uid);
    setBallPos({ x: tp.x, y: tp.y + 30 });
    sfx.throwBall(); setBallCls('throw');
    await sleep(780);
    sfx.ballHit(); api.setClass(target.uid, 'sucked'); api.flash('on');
    await sleep(500);
    setBallCls('');
    const res = await onThrow(timing);
    for (let i = 0; i < res.shakes; i++) { await sleep(350); sfx.shake(); setBallCls(''); await sleep(20); setBallCls('wobble'); await sleep(700); }
    if (res.success) {
      setBallCls('caught'); sfx.caught(); setSuccess(true);
      await api.banner(`やったー！ ${target.name}を ゲットした！`, 'gold', 2200);
      setPhase('result'); onDone(true);
    } else {
      setBallCls('open'); sfx.breakOut(); api.setClass(target.uid, 'popout', 500);
      setSuccess(false);
      await api.banner(res.shakes >= 2 ? 'ああ！ おしかった！' : 'ダメだ！ ボールから でてしまった！', '', 1300);
      setBallPos(null); setBallCls('');
      if (ballsLeft - 1 > 0) { setPhase('aim'); setSuccess(null); } else { setPhase('result'); onDone(false); }
    }
  }

  const outer = 240; const good = outer * GOOD;
  return (
    <>
      {phase === 'aim' && (
        <>
          <div className="ring-wrap" style={{ width: outer, height: outer }}>
            <div className="target" />
            <div className="good" style={{ left: (outer - (good + GOOD_W * outer)) / 2, top: (outer - (good + GOOD_W * outer)) / 2, width: good + GOOD_W * outer, height: good + GOOD_W * outer, borderWidth: GOOD_W * outer / 2 }} />
            <div className="ring" style={{ width: ring * outer, height: ring * outer }} />
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 20, textAlign: 'center', zIndex: 12 }}>
            <div className="small" style={{ marginBottom: 8, fontWeight: 900, textShadow: '0 2px 4px #000' }}>みどりの わっかで タップ！　ボール ×{ballsLeft}{lastTiming !== null && ` ／ タイミング ${Math.round(lastTiming * 100)}%`}</div>
            <button className="btn primary lg" onClick={throwBall} onTouchStart={e => { e.preventDefault(); throwBall(); }}>⚪ なげる！</button>
          </div>
        </>
      )}
      {ballPos && <div className={`ball ${ballCls}`} style={{ left: ballPos.x, top: ballPos.y }} />}
      {success && <Confetti />}
    </>
  );
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
