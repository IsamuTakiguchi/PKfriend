import { create } from 'zustand';
/** UI-level flags shared with the app shell (e.g. hide navigation while a battle is on screen). */
export const useUi = create<{ immersive: boolean; setImmersive: (v: boolean) => void }>(set => ({ immersive: false, setImmersive: v => set({ immersive: v }) }));
export function useImmersive() {
  const set = useUi(s => s.setImmersive);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffectOnce(() => { set(true); return () => set(false); });
}
import { useEffect } from 'react';
function useEffectOnce(fn: () => void | (() => void)) { useEffect(fn, []); } // eslint-disable-line react-hooks/exhaustive-deps
