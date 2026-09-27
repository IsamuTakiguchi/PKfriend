// DOM-free GIF decode + xBR upscale. Runs inside a Web Worker (gifsmooth.worker.ts), or inline as a fallback.
import { parseGIF, decompressFrames } from 'gifuct-js';
import { xbr2x, xbr3x, xbr4x } from 'xbr-js';

export interface SmoothRaw { w: number; h: number; f: number; frames: ArrayBuffer[]; delays: number[] }

/** Upscaled pixels kept per sprite (all frames) — keeps memory around 30 MB for the largest sprites. */
const PIXEL_BUDGET = 7_500_000;

/** Give fully transparent pixels next to the sprite the colour of an opaque neighbour (alpha stays 0),
 *  two pixels deep, so blending at the upscaled outline does not pull in black. */
function bleedEdges(px: Uint32Array, w: number, h: number) {
  let filled = new Uint8Array(px.length); for (let i = 0; i < px.length; i++) filled[i] = px[i] >>> 24 ? 1 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const next = filled.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (filled[i]) continue;
      const j = x > 0 && filled[i - 1] ? i - 1 : x < w - 1 && filled[i + 1] ? i + 1 : y > 0 && filled[i - w] ? i - w : y < h - 1 && filled[i + w] ? i + w : -1;
      if (j >= 0) { px[i] = px[j] & 0x00ffffff; next[i] = 1; }
    }
    filled = next;
  }
}

/** deviceScale = the largest on-screen enlargement expected (CSS scale × devicePixelRatio). */
export async function smoothGif(url: string, deviceScale: number): Promise<SmoothRaw> {
  const res = await fetch(url, { mode: 'cors' }); if (!res.ok) throw new Error(`gif ${res.status}`);
  const gif = parseGIF(await res.arrayBuffer());
  const frames = decompressFrames(gif, true); if (!frames.length) throw new Error('empty gif');
  const W = gif.lsd.width, H = gif.lsd.height;
  const cssScale = Math.min((300 * 0.94) / Math.max(W, H), 3.4);
  let f = Math.min(4, Math.max(2, Math.ceil((cssScale * deviceScale) / 3.4)));
  while (f > 2 && W * H * frames.length * f * f > PIXEL_BUDGET) f--;
  const scale = f === 4 ? xbr4x : f === 3 ? xbr3x : xbr2x;

  const buf = new Uint8ClampedArray(W * H * 4); let restore: Uint8ClampedArray | null = null;
  const out: ArrayBuffer[] = []; const delays: number[] = [];
  let prev: (typeof frames)[number] | null = null;
  for (const fr of frames) {
    // dispose of the previous frame (2 = clear its rectangle, 3 = restore what was under it)
    if (prev?.disposalType === 2) { const { left, top, width, height } = prev.dims; for (let y = top; y < top + height && y < H; y++) buf.fill(0, (y * W + left) * 4, (y * W + Math.min(W, left + width)) * 4); }
    else if (prev?.disposalType === 3 && restore) buf.set(restore);
    restore = fr.disposalType === 3 ? buf.slice() : null;
    // draw this frame's patch; its transparent pixels keep what is underneath
    const { left, top, width, height } = fr.dims; const p = fr.patch;
    for (let y = 0; y < height; y++) { const cy = top + y; if (cy >= H) break; for (let x = 0; x < width; x++) { const cx = left + x; if (cx >= W) continue; const s = (y * width + x) * 4; if (p[s + 3] === 0) continue; const d = (cy * W + cx) * 4; buf[d] = p[s]; buf[d + 1] = p[s + 1]; buf[d + 2] = p[s + 2]; buf[d + 3] = 255; } }
    prev = fr;
    const px = new Uint32Array(buf.slice().buffer); bleedEdges(px, W, H);
    out.push(scale(px, W, H, { blendColors: true, scaleAlpha: true }).buffer as ArrayBuffer);
    delays.push(fr.delay < 20 ? 100 : fr.delay); // browsers treat tiny GIF delays as 100 ms
  }
  return { w: W, h: H, f, frames: out, delays };
}
