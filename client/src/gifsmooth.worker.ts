import { smoothGif } from './gifsmooth-core';

self.onmessage = async (e: MessageEvent<{ id: number; url: string; deviceScale: number }>) => {
  const { id, url, deviceScale } = e.data;
  try {
    const r = await smoothGif(url, deviceScale);
    (self as unknown as Worker).postMessage({ id, ok: true, ...r }, r.frames);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};
