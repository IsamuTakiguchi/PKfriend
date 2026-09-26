import { useStore } from '../store';
import { Modal, PokeCard } from './ui';
import type { OwnedPokemon } from '@pkfriend/shared';

export function BoxPicker({ title, onPick, onClose, exclude = [], selected, children }: { title: string; onPick: (p: OwnedPokemon) => void; onClose: () => void; exclude?: string[]; selected?: string; children?: React.ReactNode }) {
  const box = useStore(s => s.box);
  const list = box.filter(p => !exclude.includes(p.uid)).sort((a, b) => b.exp - a.exp);
  return (
    <Modal title={title} onClose={onClose}>
      {list.length === 0 ? <p className="muted center">えらべる ポケモンが いません</p> : (
        <div className="grid3">{list.map(p => <PokeCard key={p.uid} p={p} size={60} selected={p.uid === selected} onClick={() => onPick(p)} />)}</div>
      )}
      {children}
    </Modal>
  );
}
