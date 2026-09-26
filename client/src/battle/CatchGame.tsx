import { useEffect, useRef, useState } from 'react';
import type { Battler, BallKind } from '@pkfriend/shared';
import type { StageApi } from './stage';
import { sfx } from '../audio';
import { Confetti } from '../components/ui';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const BALL_TOP: Record<BallKind, string> = { monster: '#ff3b30', super: '#3b82f6', hyper: '#111', master: '#7c3aed' };

/**
 * Ball throw sequence: throw -> target sucked in -> shakes -> caught / break out.
 * `resolve` returns the outcome (rolled locally or decided by the server).
 */
export function ThrowBall({ api, target, ball, resolve, onDone }: { api: StageApi; target: Battler; ball: BallKind; resolve: () => Promise<{ success: boolean; shakes: number }>; onDone: (success: boolean) => void }) {
  const [ballCls, setBallCls] = useState('');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [success, setSuccess] = useState<boolean | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    (async () => {
      const tp = api.posOf(target.uid);
      setPos({ x: tp.x, y: tp.y + 30 });
      sfx.throwBall(); setBallCls('throw');
      await sleep(780);
      sfx.ballHit(); api.setClass(target.uid, 'sucked'); api.flash('on');
      await sleep(500); setBallCls('');
      const res = await resolve();
      for (let i = 0; i < res.shakes; i++) { await sleep(350); sfx.shake(); setBallCls(''); await sleep(20); setBallCls('wobble'); await sleep(700); }
      if (res.success) {
        setBallCls('caught'); sfx.caught(); setSuccess(true);
        await api.banner(`やったー！ ${target.name}を ゲットした！`, 'gold', 2000);
        onDone(true);
      } else {
        setBallCls('open'); sfx.breakOut(); api.setClass(target.uid, 'popout', 500); setSuccess(false);
        await api.banner(res.shakes >= 2 ? 'ああ！ おしかった！' : 'ダメだ！ ボールから でてしまった！', '', 1200);
        onDone(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {pos && <div className={`ball ${ballCls}`} style={{ left: pos.x, top: pos.y, background: `linear-gradient(180deg, ${BALL_TOP[ball]} 0 46%, #111 46% 54%, #f4f4f8 54%)` }} />}
      {success && <Confetti />}
    </>
  );
}
