import { create } from 'zustand';
export interface Toast { id: number; text: string; kind?: 'ok' | 'bad'; }
interface T { toasts: Toast[]; push: (text: string, kind?: Toast['kind']) => void; }
let n = 0;
export const useToast = create<T>(set => ({
  toasts: [],
  push: (text, kind) => { const id = ++n; set(s => ({ toasts: [...s.toasts, { id, text, kind }].slice(-4) })); setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 2800); },
}));
export const toast = (text: string, kind?: Toast['kind']) => useToast.getState().push(text, kind);
