// Illustrated, gently animated SVG backdrops for each area (no external images).
import { memo } from 'react';

export type SceneId = 'grass' | 'sea' | 'cave' | 'plant' | 'volcano' | 'sky' | 'arena' | 'field';

const Clouds = ({ y = 80, opacity = 0.9, dur = 60 }: { y?: number; opacity?: number; dur?: number }) => (
  <g opacity={opacity} style={{ animation: `drift ${dur}s linear infinite` }}>
    {[0, 1].map(k => (
      <g key={k} transform={`translate(${k * 520} 0)`}>
        <ellipse cx="60" cy={y} rx="58" ry="22" fill="#fff" /><ellipse cx="95" cy={y - 14} rx="40" ry="26" fill="#fff" /><ellipse cx="130" cy={y + 2} rx="50" ry="20" fill="#fff" />
        <ellipse cx="300" cy={y + 40} rx="46" ry="18" fill="#fff" /><ellipse cx="330" cy={y + 28} rx="34" ry="22" fill="#fff" /><ellipse cx="365" cy={y + 42} rx="42" ry="16" fill="#fff" />
      </g>
    ))}
  </g>
);
const Tree = ({ x, y, s = 1, dark = false }: { x: number; y: number; s?: number; dark?: boolean }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-6" y="0" width="12" height="34" rx="3" fill={dark ? '#3b2a1a' : '#6b4a2b'} />
    <circle cx="0" cy="-18" r="30" fill={dark ? '#1f5a2e' : '#2f8f46'} /><circle cx="-20" cy="-4" r="22" fill={dark ? '#1a4d27' : '#2a7f3e'} /><circle cx="20" cy="-6" r="24" fill={dark ? '#23653a' : '#39a154'} /><circle cx="-4" cy="-38" r="18" fill={dark ? '#2a7a40' : '#4cb867'} />
  </g>
);

function GrassScene() {
  return (
    <svg className="scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="g-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4fa3e8" /><stop offset="0.55" stopColor="#a9dcf7" /><stop offset="1" stopColor="#e9f6ff" /></linearGradient>
        <linearGradient id="g-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fcf5a" /><stop offset="1" stopColor="#3f8f2f" /></linearGradient>
        <radialGradient id="g-sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#fff9c4" /><stop offset="0.4" stopColor="#ffe066" /><stop offset="1" stopColor="#ffe066" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="390" height="844" fill="url(#g-sky)" />
      <circle cx="310" cy="120" r="90" fill="url(#g-sun)" style={{ animation: 'pulse 6s ease-in-out infinite' }} />
      <circle cx="310" cy="120" r="34" fill="#fff4b0" />
      <Clouds y={110} dur={70} /><Clouds y={210} opacity={0.6} dur={110} />
      <path d="M0 470 Q 100 380 220 440 T 390 410 V 844 H 0 Z" fill="#6fb3e0" opacity="0.5" />
      <path d="M0 520 Q 90 440 200 500 T 390 470 V 844 H 0 Z" fill="#5fae6a" />
      <path d="M0 600 Q 120 520 260 590 T 390 560 V 844 H 0 Z" fill="url(#g-ground)" />
      <Tree x={40} y={560} s={0.9} /><Tree x={340} y={540} s={1.1} /><Tree x={120} y={520} s={0.6} dark /><Tree x={290} y={515} s={0.55} dark />
      <g fill="#2e7d32" opacity="0.8">{Array.from({ length: 22 }, (_, i) => <path key={i} d={`M${i * 18 + 4} 844 q 6 -46 12 0 z`} style={{ transformOrigin: `${i * 18 + 10}px 844px`, animation: `sway ${2.5 + (i % 5) * 0.4}s ease-in-out ${i * 0.13}s infinite alternate` }} />)}</g>
      <g fill="#fff" opacity="0.9">{[60, 150, 250, 330].map((x, i) => <circle key={i} cx={x} cy={700 + (i % 2) * 40} r="4" style={{ animation: `sway ${3 + i}s ease-in-out infinite alternate` }} />)}</g>
      <rect width="390" height="844" fill="url(#vignette)" />
    </svg>
  );
}
function SeaScene() {
  return (
    <svg className="scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="s-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b7fd6" /><stop offset="0.5" stopColor="#8fd0f5" /><stop offset="1" stopColor="#ffe9c9" /></linearGradient>
        <linearGradient id="s-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f7fc2" /><stop offset="1" stopColor="#0b4f8a" /></linearGradient>
        <linearGradient id="s-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f3dfb0" /><stop offset="1" stopColor="#d9bd82" /></linearGradient>
      </defs>
      <rect width="390" height="844" fill="url(#s-sky)" />
      <circle cx="90" cy="150" r="40" fill="#fff3c4" /><circle cx="90" cy="150" r="80" fill="#fff3c4" opacity="0.25" />
      <Clouds y={90} opacity={0.85} dur={90} />
      <path d="M0 400 Q 60 380 130 395 T 260 385 T 390 395 V 844 H 0 Z" fill="url(#s-sea)" />
      {[0, 1, 2, 3].map(i => <path key={i} d={`M-100 ${430 + i * 45} q 40 -16 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0`} fill="none" stroke="#fff" strokeOpacity={0.35 - i * 0.06} strokeWidth="3" style={{ animation: `wave ${5 + i}s linear infinite` }} />)}
      <path d="M0 640 Q 120 610 220 650 T 390 630 V 844 H 0 Z" fill="url(#s-sand)" />
      <path d="M0 655 Q 120 625 220 665 T 390 645 V 700 H 0 Z" fill="#fff" opacity="0.45" style={{ animation: 'foam 4s ease-in-out infinite alternate' }} />
      <g transform="translate(320 560)"><rect x="-5" y="0" width="10" height="90" fill="#8b5a2b" /><path d="M0 0 q -70 -20 -60 -80 q 40 30 60 80 z" fill="#2e8b57" /><path d="M0 0 q 70 -20 60 -80 q -40 30 -60 80 z" fill="#3cb371" /><path d="M0 0 q -10 -70 30 -90 q -5 50 -30 90 z" fill="#3cb371" /></g>
      <g fill="#c9a86a"><circle cx="70" cy="760" r="8" /><circle cx="120" cy="800" r="5" /><ellipse cx="230" cy="790" rx="14" ry="6" /></g>
      <rect width="390" height="844" fill="url(#vignette)" />
    </svg>
  );
}
function CaveScene() {
  return (
    <svg className="scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="c-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0e0b1f" /><stop offset="1" stopColor="#2b2340" /></linearGradient>
        <radialGradient id="c-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#7ee8fa" stopOpacity="0.9" /><stop offset="1" stopColor="#7ee8fa" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="390" height="844" fill="url(#c-bg)" />
      <path d="M0 0 H390 V120 Q 350 60 320 140 Q 300 40 270 130 Q 250 70 220 150 Q 200 60 170 140 Q 150 50 120 130 Q 100 70 70 150 Q 50 60 0 120 Z" fill="#1c1630" />
      <path d="M0 0 H390 V70 Q 340 30 300 90 Q 260 20 220 90 Q 180 30 140 90 Q 100 20 60 90 Q 30 40 0 70 Z" fill="#150f28" />
      {[40, 130, 250, 340].map((x, i) => <g key={i} transform={`translate(${x} ${560 + (i % 2) * 60})`} style={{ animation: `pulse ${3 + i * 0.7}s ease-in-out infinite` }}><circle r="60" fill="url(#c-glow)" /><path d="M0 -40 L18 -8 L10 30 L-10 30 L-18 -8 Z" fill="#9df3ff" opacity="0.9" /><path d="M0 -40 L18 -8 L0 -2 Z" fill="#fff" opacity="0.7" /></g>)}
      <path d="M0 720 Q 100 680 200 720 T 390 700 V 844 H 0 Z" fill="#221b38" />
      <path d="M0 780 Q 120 750 220 790 T 390 770 V 844 H 0 Z" fill="#2f2648" />
      <g fill="#3a3158"><path d="M60 720 l 25 -90 l 25 90 z" /><path d="M280 700 l 20 -70 l 20 70 z" /><path d="M330 720 l 12 -40 l 12 40 z" /></g>
      <g fill="#fff" opacity="0.5">{Array.from({ length: 14 }, (_, i) => <circle key={i} cx={(i * 67) % 390} cy={200 + (i * 53) % 400} r="1.6" style={{ animation: `twinkle ${2 + (i % 4)}s ease-in-out ${i * 0.3}s infinite alternate` }} />)}</g>
      <rect width="390" height="844" fill="url(#vignette)" />
    </svg>
  );
}
function PlantScene() {
  return (
    <svg className="scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="p-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b2a4a" /><stop offset="0.6" stopColor="#c56b1d" /><stop offset="1" stopColor="#ffd35c" /></linearGradient>
      </defs>
      <rect width="390" height="844" fill="url(#p-sky)" />
      <circle cx="195" cy="480" r="70" fill="#ffe27a" /><circle cx="195" cy="480" r="120" fill="#ffe27a" opacity="0.25" />
      {[60, 195, 330].map((x, i) => <g key={i} stroke="#1b1a2c" strokeWidth="5" fill="none" opacity="0.9"><path d={`M${x} 620 L${x - 40} 300 M${x} 620 L${x + 40} 300 M${x - 30} 380 H${x + 30} M${x - 20} 460 H${x + 20} M${x - 34} 330 H${x + 34}`} /><path d={`M${x - 90} 310 Q ${x} 360 ${x + 90} 310`} strokeWidth="2" /><path d={`M${x - 90} 350 Q ${x} 400 ${x + 90} 350`} strokeWidth="2" /></g>)}
      <g fill="#1b1a2c"><rect x="0" y="600" width="390" height="244" /><rect x="40" y="520" width="90" height="90" rx="4" /><rect x="150" y="540" width="120" height="70" rx="4" /><rect x="290" y="500" width="70" height="110" rx="4" /><rect x="60" y="440" width="14" height="80" /><rect x="310" y="420" width="18" height="80" /></g>
      <g fill="#ffe27a">{[52, 74, 160, 190, 220, 300, 330].map((x, i) => <rect key={i} x={x} y={545 + (i % 3) * 18} width="10" height="8" style={{ animation: `twinkle ${1.5 + (i % 3) * 0.5}s ease-in-out ${i * 0.2}s infinite alternate` }} />)}</g>
      <path d="M120 250 l 20 40 l -14 6 l 24 50 l -30 -30 l 12 -8 z" fill="#fff36b" style={{ animation: 'flicker 2.4s steps(2) infinite' }} />
      <path d="M270 200 l 16 34 l -12 5 l 20 44 l -26 -26 l 10 -7 z" fill="#fff36b" style={{ animation: 'flicker 3.1s steps(2) 1s infinite' }} />
      <g stroke="#ffe27a" strokeWidth="2" opacity="0.5"><path d="M0 660 H390 M0 700 H390 M0 740 H390" /></g>
      <rect width="390" height="844" fill="url(#vignette)" />
    </svg>
  );
}
function VolcanoScene() {
  return (
    <svg className="scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="v-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a0a0a" /><stop offset="0.6" stopColor="#7a1f12" /><stop offset="1" stopColor="#f26b1d" /></linearGradient>
        <linearGradient id="v-lava" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd166" /><stop offset="1" stopColor="#ff5722" /></linearGradient>
      </defs>
      <rect width="390" height="844" fill="url(#v-sky)" />
      <g fill="#ffb347" opacity="0.6">{Array.from({ length: 16 }, (_, i) => <circle key={i} cx={(i * 59) % 390} cy={(i * 97) % 500 + 100} r={1.5 + (i % 3)} style={{ animation: `rise ${4 + (i % 5)}s linear ${i * 0.4}s infinite` }} />)}</g>
      <path d="M-20 560 L 140 250 L 200 300 L 260 230 L 410 560 Z" fill="#3a1d16" />
      <path d="M140 250 L 200 300 L 260 230 L 240 280 L 200 320 L 160 290 Z" fill="#ff7a1a" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
      <path d="M195 300 q -10 80 -40 140 q 30 -40 50 -60 q 10 60 -10 120 q 30 -50 40 -90 q 20 60 60 100 q -30 -70 -40 -140 z" fill="url(#v-lava)" opacity="0.9" />
      <path d="M0 560 Q 100 520 200 560 T 390 540 V 844 H 0 Z" fill="#2a120d" />
      <path d="M0 660 Q 90 630 190 665 T 390 650 V 844 H 0 Z" fill="url(#v-lava)" opacity="0.85" style={{ animation: 'pulse 3s ease-in-out infinite' }} />
      <path d="M0 700 Q 100 680 200 705 T 390 690 V 844 H 0 Z" fill="#1c0b08" />
      <g fill="#3a1d16"><path d="M40 700 l 30 -50 l 40 50 z" /><path d="M300 690 l 25 -40 l 35 40 z" /></g>
      <rect width="390" height="844" fill="url(#vignette)" />
    </svg>
  );
}
function SkyScene() {
  return (
    <svg className="scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="k-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b1464" /><stop offset="0.5" stopColor="#5b3fa0" /><stop offset="1" stopColor="#f7a8c8" /></linearGradient>
      </defs>
      <rect width="390" height="844" fill="url(#k-sky)" />
      <g fill="#fff">{Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 97) % 390} cy={(i * 61) % 420} r={(i % 3) * 0.6 + 0.8} style={{ animation: `twinkle ${1.5 + (i % 5) * 0.5}s ease-in-out ${(i % 7) * 0.2}s infinite alternate` }} />)}</g>
      <circle cx="300" cy="140" r="46" fill="#fff8d6" /><circle cx="318" cy="128" r="40" fill="#5b3fa0" opacity="0.95" />
      <Clouds y={520} opacity={0.95} dur={80} /><Clouds y={640} opacity={0.8} dur={120} />
      <g transform="translate(195 520)" style={{ animation: 'float 6s ease-in-out infinite' }}>
        <path d="M-90 40 Q -60 90 0 80 Q 60 90 90 40 Q 60 60 0 60 Q -60 60 -90 40 Z" fill="#4a3a7a" />
        <path d="M-90 40 Q 0 20 90 40 Q 60 60 0 60 Q -60 60 -90 40 Z" fill="#6ac26f" />
        <rect x="-26" y="-140" width="52" height="180" fill="#d9d3f0" /><rect x="-36" y="-150" width="72" height="14" fill="#bdb3e6" /><path d="M-36 -150 L0 -200 L36 -150 Z" fill="#9f8fdc" />
        {[-120, -90, -60, -30].map((y, i) => <rect key={i} x="-10" y={y} width="20" height="14" fill="#ffe9a8" opacity="0.9" />)}
      </g>
      <rect width="390" height="844" fill="url(#vignette)" />
    </svg>
  );
}
function ArenaScene() {
  return (
    <svg className="scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="a-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b0620" /><stop offset="0.6" stopColor="#3a0f3d" /><stop offset="1" stopColor="#8a1c3c" /></linearGradient>
        <radialGradient id="a-light" cx="0.5" cy="0" r="1"><stop offset="0" stopColor="#ffd5e0" stopOpacity="0.55" /><stop offset="1" stopColor="#ffd5e0" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="390" height="844" fill="url(#a-sky)" />
      <g fill="#fff">{Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 83) % 390} cy={(i * 47) % 300} r="1.2" style={{ animation: `twinkle ${2 + (i % 4)}s ease-in-out infinite alternate` }} />)}</g>
      <polygon points="60,0 -80,600 200,600" fill="url(#a-light)" style={{ animation: 'sweep 7s ease-in-out infinite alternate' }} />
      <polygon points="330,0 190,600 470,600" fill="url(#a-light)" style={{ animation: 'sweep 9s ease-in-out infinite alternate-reverse' }} />
      <g fill="#2a1836"><path d="M0 420 H390 V520 H0 Z" /><path d="M0 400 H390 V420 H0 Z" fill="#3d2450" /></g>
      <g fill="#ffb3c6" opacity="0.7">{Array.from({ length: 26 }, (_, i) => <circle key={i} cx={8 + i * 15} cy={445 + (i % 3) * 22} r="4" style={{ animation: `twinkle ${1 + (i % 3) * 0.4}s ease-in-out ${i * 0.1}s infinite alternate` }} />)}</g>
      <ellipse cx="195" cy="700" rx="260" ry="140" fill="#4a1d3a" /><ellipse cx="195" cy="700" rx="200" ry="105" fill="#6b2a4d" /><ellipse cx="195" cy="700" rx="140" ry="70" fill="#8b3a5e" opacity="0.8" />
      <rect width="390" height="844" fill="url(#vignette)" />
    </svg>
  );
}
function FieldScene() { return <GrassScene />; }

const SCENES: Record<SceneId, () => JSX.Element> = { grass: GrassScene, sea: SeaScene, cave: CaveScene, plant: PlantScene, volcano: VolcanoScene, sky: SkyScene, arena: ArenaScene, field: FieldScene };

export const Scene = memo(function Scene({ id }: { id: SceneId | string }) {
  const C = SCENES[(id as SceneId) in SCENES ? (id as SceneId) : 'field'];
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }}><defs><radialGradient id="vignette" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.45" /></radialGradient></defs></svg>
      <C />
    </>
  );
});
