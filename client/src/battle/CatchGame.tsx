import { useEffect, useRef, useState } from 'react';
import type { Battler, BallKind } from '@pkfriend/shared';
import type { StageApi } from './stage';
import { sfx } from '../audio';
import { say, lines } from '../voice';
import { Confetti } from '../components/ui';
import { Ball } from '../components/Ball';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type Pt = { x: number; y: number };

/**
 * Ball throw: the ball flies in from the player's hand, hits the pokémon and pops open, red light pulls it in,
 * the ball drops to the ground and shakes — each shake with a longer, darker, heart-pounding pause —
 * and then either clicks shut (caught) or trembles and bursts open (escaped).
 * `resolve` returns the outcome (rolled locally or decided by the server).
 */
export function ThrowBall({ api, target, ball, resolve, onDone }: { api: StageApi; target: Battler; ball: BallKind; resolve: () => Promise<{ success: boolean; shakes: number }>; onDone: (success: boolean) => void }) {
  const [cls, setCls] = useState('');
  const [pos, setPos] = useState<Pt | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [beam, setBeam] = useState<{ x: number; y: number; h: number } | null>(null);
  const [tension, setTension] = useState(0);
  const [success, setSuccess] = useState<boolean | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; started.current = true;
    (async () => {
      const root = api.refs.root.current; const W = root?.clientWidth ?? 390, H = root?.clientHeight ?? 600;
      const b = api.bodyOf(target.uid);
      const hover: Pt = { x: b.x, y: b.y - b.r * 0.7 };      // the ball hits the pokémon here and pops open
      const rest: Pt = { x: b.x, y: b.ground - 24 };         // then it lies on the ground in front of it
      // 1. throw: from the bottom of the screen in a spinning arc
      setPos(hover); setVars({ '--sx': `${W / 2 - hover.x}px`, '--sy': `${H - 50 - hover.y}px` }); setCls('fly'); sfx.throwBall();
      await sleep(780);
      // 2. hit → hop → open, red light pulls the pokémon in
      sfx.ballHit(); setCls('hop'); await sleep(200);
      sfx.ballOpen(); setCls('opened'); setBeam({ x: hover.x, y: hover.y, h: Math.max(40, b.y + b.r * 0.4 - hover.y) });
      api.setClass(target.uid, 'sucked'); api.flash('on');
      await sleep(750); setBeam(null); setCls(''); await sleep(260);
      // 3. the ball drops to the ground and bounces
      setVars(v => ({ ...v, '--dy': `${rest.y - hover.y}px` })); setCls('drop'); await sleep(660);
      setPos(rest); setCls(''); setVars(v => ({ ...v, '--vx': `${rest.x}px`, '--vy': `${rest.y}px` }));
      const res = await resolve();
      // 4. shakes: always at least one, the pauses get longer and the screen darker each time
      const shown = res.success ? 3 : Math.max(1, Math.min(3, res.shakes));
      for (let i = 0; i < shown; i++) {
        setTension(i + 1);
        const pause = 600 + i * 500; const beats = Math.max(1, Math.round(pause / 480));
        for (let k = 0; k < beats; k++) { sfx.heartbeat(); await sleep(pause / beats); }
        say(lines.shakeTension(i), { priority: true });
        sfx.shake(); setCls(''); await sleep(20); setCls(i === shown - 1 ? 'wobble big' : 'wobble'); await sleep(i === shown - 1 ? 950 : 780);
        setCls('');
      }
      if (res.success) {
        // 5a. click! — caught
        await sleep(650); sfx.tick(); setTension(0);
        setCls('caught'); sfx.caught(); setSuccess(true);
        const eng = api.refs.engine.current;
        eng?.emit(22, () => { const a = Math.random() * Math.PI * 2, s = 140 + Math.random() * 260; return { x: rest.x, y: rest.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, g: 250, size: 10 + Math.random() * 10, shape: 'star', color: ['#ffe066', '#ffffff', '#ffb74d'][Math.floor(Math.random() * 3)], max: 1 }; });
        eng?.ring(rest, 10, 110, '#ffe066', 0.6, 6);
        await api.banner(`やったー！ ${target.name}を ゲットした！`, 'gold', 2000);
        onDone(true);
      } else {
        // 5b. it trembles… and bursts open
        await sleep(300); setCls('tremble'); sfx.tremble(); await sleep(1000);
        setTension(0); api.flash('on'); api.shake(true); sfx.breakOut(); setCls('burst');
        const eng = api.refs.engine.current;
        eng?.emit(30, () => { const a = Math.random() * Math.PI * 2, s = 220 + Math.random() * 380; return { x: rest.x, y: rest.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: 4 + Math.random() * 4, shape: 'spark', color: Math.random() < 0.5 ? '#ffffff' : '#ff5a5a', max: 0.5 }; });
        eng?.ring(rest, 10, 150, '#ffffff', 0.45, 7);
        api.setClass(target.uid, 'popout', 700);
        if (res.shakes >= 2) say(lines.almost(), { priority: true });
        await api.banner(res.shakes >= 2 ? 'ああっ！ おしい！ あと すこしだった！' : 'ダメだ！ ボールから でてしまった！', '', 1800);
        onDone(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div className="catch-vignette" style={{ opacity: Math.min(0.85, tension * 0.26), ...(vars as React.CSSProperties) }} />
      {beam && <div className="catch-beam" style={{ left: beam.x, top: beam.y, height: beam.h }} />}
      {pos && <div className={`catch-ball ${cls}`} style={{ left: pos.x, top: pos.y, ...(vars as React.CSSProperties) }}><Ball kind={ball} size={56} /></div>}
      {success && <Confetti />}
    </>
  );
}
