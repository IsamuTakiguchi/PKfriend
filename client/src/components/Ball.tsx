import type { BallKind } from '@pkfriend/shared';

const TOP: Record<BallKind, string> = { monster: '#ee2b2b', super: '#2f6fe0', hyper: '#1c1c22', master: '#7b2fd6' };

/**
 * A solid, readable ball drawing for every ball kind (モンスター / スーパー / ハイパー / マスター).
 * The upper half is its own group (`.lid`) so the ball can open when it catches a pokémon.
 */
export function Ball({ kind, size = 44, className = '' }: { kind: BallKind; size?: number; className?: string }) {
  const top = TOP[kind];
  return (
    <svg className={`ballsvg ${className}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      {/* lower half */}
      <path d="M3 50 A47 47 0 0 0 97 50 Z" fill="#f5f5f8" />
      <path d="M8 62 A44 44 0 0 0 92 62 A47 47 0 0 1 8 62 Z" fill="#c9cbd6" opacity=".6" />
      <g className="lid">
        <path d="M3 50 A47 47 0 0 1 97 50 Z" fill={top} />
        {kind === 'super' && <><path d="M14 30 Q22 12 40 8 L36 26 Q24 28 20 40 Z" fill="#e53935" /><path d="M86 30 Q78 12 60 8 L64 26 Q76 28 80 40 Z" fill="#e53935" /></>}
        {kind === 'hyper' && <><path d="M18 20 L32 12 L42 46 L28 46 Z" fill="#ffd21f" /><path d="M82 20 L68 12 L58 46 L72 46 Z" fill="#ffd21f" /></>}
        {kind === 'master' && <><circle cx="26" cy="28" r="9" fill="#ff5fa2" /><circle cx="74" cy="28" r="9" fill="#ff5fa2" /><text x="50" y="36" textAnchor="middle" fontSize="24" fontWeight="900" fill="#fff" fontFamily="sans-serif">M</text></>}
        <ellipse cx="32" cy="24" rx="15" ry="8" fill="#fff" opacity=".45" transform="rotate(-28 32 24)" />
        <path d="M3 50 A47 47 0 0 1 97 50" fill="none" stroke="#111" strokeWidth="5" />
      </g>
      <path d="M3 50 A47 47 0 0 0 97 50" fill="none" stroke="#111" strokeWidth="5" />
      <rect x="3" y="45.5" width="94" height="9" fill="#111" />
      <circle cx="50" cy="50" r="14" fill="#111" />
      <circle className="ball-btn" cx="50" cy="50" r="8.5" fill="#fff" stroke="#9a9aa6" strokeWidth="2" />
    </svg>
  );
}
