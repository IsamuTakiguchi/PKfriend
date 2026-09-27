// Live commentary. Two backends:
//  1. VOICEVOX-compatible engine (optional, natural voices) when VITE_TTS_URL is set — e.g. a self-hosted voicevox_engine.
//  2. The browser's speech synthesis (Web Speech API), preferring natural / premium Japanese male voices.
import { useStore } from './store';
import { music } from './music';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {};
const TTS_URL = (env.VITE_TTS_URL ?? '').replace(/\/$/, '');
const TTS_SPEAKER = Number(env.VITE_TTS_SPEAKER ?? 81); // VOICEVOX: 81 = 青山龍星（熱血）, 13 = 青山龍星（ノーマル）, 11 = 玄野武宏

// ---------------------------------------------------------------- Web Speech voice choice
let voices: SpeechSynthesisVoice[] = [];
let chosen: SpeechSynthesisVoice | null = null;
const MALE_HINT = /otoya|hattori|ichiro|keita|daichi|takumi|kenji|naoki|shinji|男性|male/i;
const FEMALE_HINT = /kyoko|haruka|ayumi|nanami|mizuki|sayaka|siri.*female|o-ren|女性|female/i;
const NATURAL_HINT = /premium|enhanced|natural|neural|拡張|高品質/i;
function refresh() {
  if (typeof speechSynthesis === 'undefined') return;
  voices = speechSynthesis.getVoices();
  const ja = voices.filter(v => /^ja/i.test(v.lang));
  const score = (v: SpeechSynthesisVoice) => (MALE_HINT.test(v.name) ? 40 : 0) + (NATURAL_HINT.test(v.name) ? 30 : 0) + (FEMALE_HINT.test(v.name) ? -25 : 0) + (v.localService ? 5 : 0) + (/google/i.test(v.name) ? 8 : 0);
  chosen = [...ja].sort((a, b) => score(b) - score(a))[0] ?? null;
}
if (typeof speechSynthesis !== 'undefined') { refresh(); speechSynthesis.addEventListener?.('voiceschanged', refresh); }
export const voiceInfo = () => ({ engine: bank ? 'bank' : TTS_URL ? 'voicevox' : 'browser', available: !!bank || !!TTS_URL || (typeof speechSynthesis !== 'undefined' && voices.some(v => /^ja/i.test(v.lang))), name: bank ? bank.credit : TTS_URL ? `VOICEVOX (speaker ${TTS_SPEAKER})` : chosen?.name ?? null, male: !!bank || !!TTS_URL || (!!chosen && MALE_HINT.test(chosen.name)) });

// ---------------------------------------------------------------- VOICEVOX backend (with a small cache)
const cache = new Map<string, Promise<ArrayBuffer | null>>();
let current: AudioBufferSourceNode | null = null;
async function synth(text: string): Promise<ArrayBuffer | null> {
  const key = `${TTS_SPEAKER}:${text}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    try {
      const q = await fetch(`${TTS_URL}/audio_query?speaker=${TTS_SPEAKER}&text=${encodeURIComponent(text)}`, { method: 'POST' }); if (!q.ok) return null;
      const query = await q.json(); query.speedScale = 1.08; query.intonationScale = 1.15; query.volumeScale = 1.1;
      const r = await fetch(`${TTS_URL}/synthesis?speaker=${TTS_SPEAKER}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) }); if (!r.ok) return null;
      return await r.arrayBuffer();
    } catch { return null; }
  })());
  return cache.get(key)!;
}
async function speakVoicevox(text: string, priority: boolean) {
  const { getAudioContext } = await import('./audio'); const ctx = getAudioContext(); if (!ctx) return false;
  const data = await synth(text); if (!data) return false;
  if (current && !priority) return true; if (current) { try { current.stop(); } catch { /* ignore */ } }
  const buf = await ctx.decodeAudioData(data.slice(0)); const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = 1.2; src.connect(g).connect(ctx.destination);
  music.duck(buf.duration * 1000 + 200, 0.4); current = src; src.onended = () => { if (current === src) current = null; }; src.start(); return true;
}

// ---------------------------------------------------------------- static voice bank (generated in CI with VOICEVOX, served with the app)
interface Bank { speaker: number; format: string; credit: string; files: Record<string, string>; }
let bank: Bank | null = null; let bankLoaded = false;
const BASE = (env.BASE_URL ?? '/');
const clipCache = new Map<string, Promise<AudioBuffer | null>>();
async function loadBank() {
  if (bankLoaded) return; bankLoaded = true;
  try { const r = await fetch(`${BASE}voice/manifest.json`, { cache: 'no-cache' }); if (r.ok) bank = await r.json(); } catch { bank = null; }
}
void loadBank();
export const bankInfo = () => bank ? { credit: bank.credit, count: Object.keys(bank.files).length } : null;
async function clip(text: string): Promise<AudioBuffer | null> {
  const file = bank?.files[text]; if (!file) return null;
  if (!clipCache.has(text)) clipCache.set(text, (async () => {
    try { const { getAudioContext } = await import('./audio'); const ctx = getAudioContext(); if (!ctx) return null; const r = await fetch(`${BASE}voice/${file}`); if (!r.ok) return null; return await ctx.decodeAudioData(await r.arrayBuffer()); } catch { return null; }
  })());
  return clipCache.get(text)!;
}
async function speakBank(text: string, priority: boolean): Promise<boolean> {
  await loadBank(); if (!bank?.files[text]) return false;
  const { getAudioContext } = await import('./audio'); const ctx = getAudioContext(); if (!ctx) return false;
  const buf = await clip(text); if (!buf) return false;
  if (current && !priority) return true; if (current) { try { current.stop(); } catch { /* ignore */ } }
  const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = 1.25; src.connect(g).connect(ctx.destination);
  music.duck(buf.duration * 1000 + 200, 0.4); current = src; src.onended = () => { if (current === src) current = null; }; src.start(); return true;
}

// ---------------------------------------------------------------- public API
let lastText = ''; let lastAt = 0;
/** Speak a short line. `priority` lines interrupt whatever is playing; normal lines are dropped while something is speaking. */
export function say(text: string, opts: { priority?: boolean; rate?: number } = {}) {
  if (!useStore.getState().voice) return;
  const now = Date.now();
  if (text === lastText && now - lastAt < 4000) return;
  lastText = text; lastAt = now;
  void (async () => {
    if (await speakBank(text, !!opts.priority)) return;
    if (TTS_URL && await speakVoicevox(text, !!opts.priority)) return;
    speakBrowser(text, opts);
  })();
}
function speakBrowser(text: string, opts: { priority?: boolean; rate?: number }) {
  if (typeof speechSynthesis === 'undefined') return;
  if (speechSynthesis.speaking && !opts.priority) return;
  if (opts.priority) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (chosen) u.voice = chosen;
  u.lang = 'ja-JP'; u.rate = opts.rate ?? 1.0; u.volume = 1;
  // keep the pitch close to natural: heavy pitch shifting is what makes synthetic voices sound robotic
  u.pitch = chosen && MALE_HINT.test(chosen.name) ? 1.0 : 0.9;
  music.duck(Math.min(4000, 400 + text.length * 130), 0.45);
  try { speechSynthesis.speak(u); } catch { /* ignore */ }
}
export function stopSpeaking() { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); if (current) { try { current.stop(); } catch { /* ignore */ } current = null; } }
export { lines } from '@pkfriend/shared';
