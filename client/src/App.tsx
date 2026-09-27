import { useEffect, useState } from 'react';
import { useStore } from './store';
import { useNet } from './net';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Explore } from './screens/Explore';
import { Box } from './screens/Box';
import { Friends } from './screens/Friends';
import { Toasts } from './components/ui';
import { unlockAudio } from './audio';
import { useBgm } from './music';
import { useUi } from './ui';

type Tab = 'home' | 'explore' | 'box' | 'friends';

export default function App() {
  const player = useStore(s => s.player);
  const connect = useNet(s => s.connect); const room = useNet(s => s.room);
  const [tab, setTab] = useState<Tab>('home');
  const immersive = useUi(s => s.immersive);
  useBgm('home');
  useEffect(() => { if (player) connect(); }, [player, connect]);
  useEffect(() => { const h = () => unlockAudio(); window.addEventListener('pointerdown', h, { once: true }); return () => window.removeEventListener('pointerdown', h); }, []);
  useEffect(() => { if (room) setTab('friends'); }, [room]);
  if (!player) return <div className="app"><Onboarding /><Toasts /></div>;
  const hideNav = immersive || (tab === 'friends' && room?.kind === 'battle' && room.phase !== 'lobby');
  return (
    <div className="app">
      {tab === 'home' && <Home go={setTab} />}
      {tab === 'explore' && <Explore />}
      {tab === 'box' && <Box />}
      {tab === 'friends' && <Friends />}
      {!hideNav && (
        <nav className="nav">
          {([['home', '🏠', 'ホーム'], ['explore', '🌿', 'たんけん'], ['box', '📦', 'ボックス'], ['friends', '👥', 'フレンド']] as const).map(([k, ico, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span className="ico">{ico}</span>{label}{k === 'friends' && room && <span className="dot on" style={{ position: 'absolute', marginTop: -30, marginLeft: 30 }} />}</button>
          ))}
        </nav>
      )}
      <Toasts />
    </div>
  );
}
