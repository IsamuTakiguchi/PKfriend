// Smooth, high-resolution playback of the small animated battle GIFs.
// The heavy part (GIF decode + xBR edge-aware upscale, see gifsmooth-core.ts) runs in a Web Worker so the
// battle animations never stutter; the frames come back as pixel buffers and are drawn on a canvas with
// high-quality smoothing.
import { smoothGif, type SmoothRaw } from './gifsmooth-core';

export interface SmoothAnim { w: number; h: number; frames: CanvasImageSource[]; delays: number[]; total: number; }

const DEVICE_SCALE = 3.4 * Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
const MAX_CACHED = 8;
const cache = new Map<string, Promise<SmoothAnim>>();

let worker: Worker | null | undefined; let seq = 0;
const pending = new Map<number, { resolve: (r: SmoothRaw) => void; reject: (e: Error) => void }>();
function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./gifsmooth.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<({ id: number; ok: true } & SmoothRaw) | { id: number; ok: false; error: string }>) => {
      const d = e.data; const p = pending.get(d.id); if (!p) return; pending.delete(d.id);
      if (d.ok) p.resolve(d); else p.reject(new Error(d.error));
    };
    worker.onerror = () => { for (const p of pending.values()) p.reject(new Error('worker failed')); pending.clear(); worker = null; };
  } catch { worker = null; }
  return worker;
}
function processRaw(url: string): Promise<SmoothRaw> {
  const w = getWorker(); if (!w) return smoothGif(url, DEVICE_SCALE); // inline fallback
  return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); w.postMessage({ id, url, deviceScale: DEVICE_SCALE }); })
    .catch(() => smoothGif(url, DEVICE_SCALE)) as Promise<SmoothRaw>;
}

async function toImage(buf: ArrayBuffer, w: number, h: number): Promise<CanvasImageSource> {
  const data = new ImageData(new Uint8ClampedArray(buf), w, h);
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(data); } catch { /* fall through */ } }
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.putImageData(data, 0, 0); return c;
}

async function build(url: string): Promise<SmoothAnim> {
  const r = await processRaw(url);
  const frames: CanvasImageSource[] = [];
  for (const b of r.frames) frames.push(await toImage(b, r.w * r.f, r.h * r.f));
  return { w: r.w, h: r.h, frames, delays: r.delays, total: r.delays.reduce((a, b) => a + b, 0) };
}

/** Decoded + upscaled animation for a GIF url (shared between every sprite showing it). */
export function loadSmooth(url: string): Promise<SmoothAnim> {
  const hit = cache.get(url);
  if (hit) { cache.delete(url); cache.set(url, hit); return hit; } // LRU bump
  const p = build(url); cache.set(url, p); p.catch(() => cache.delete(url));
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
  return p;
}

export function frameAt(a: SmoothAnim, ms: number): number {
  let t = ms % a.total; for (let i = 0; i < a.delays.length; i++) { if (t < a.delays[i]) return i; t -= a.delays[i]; } return 0;
}
