// Synthesize every commentary line with a VOICEVOX-compatible engine and write a static voice bank
// (client/public/voice/<hash>.mp3 + manifest.json). Usage:
//   npx tsx scripts/build-voice.mts --engine http://127.0.0.1:50021 --speaker 11 [--out client/public/voice] [--format mp3|wav] [--limit N]
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { allLines } from '../shared/src/index.js';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const ENGINE = arg('engine', 'http://127.0.0.1:50021').replace(/\/$/, '');
const SPEAKER = Number(arg('speaker', '11'));
const OUT = arg('out', 'client/public/voice');
const FORMAT = arg('format', 'mp3');
const LIMIT = Number(arg('limit', '0'));
const CONC = Number(arg('concurrency', '3'));
mkdirSync(OUT, { recursive: true });

const id = (text: string) => createHash('sha1').update(`${SPEAKER}\n${text}`).digest('hex').slice(0, 14);
let lines = allLines(); if (LIMIT) lines = lines.slice(0, LIMIT);
const manifestPath = path.join(OUT, 'manifest.json');
const manifest: { speaker: number; format: string; credit: string; files: Record<string, string> } = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { speaker: SPEAKER, format: FORMAT, credit: '', files: {} };
manifest.speaker = SPEAKER; manifest.format = FORMAT;

async function fetchRetry(url: string, init: RequestInit, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) { try { const r = await fetch(url, init); if (r.ok) return r; if (i >= tries - 1) throw new Error(`${r.status} ${url}`); } catch (e) { if (i >= tries - 1) throw e; } await new Promise(r => setTimeout(r, 800 * (i + 1))); }
}
async function speakerName(): Promise<string> {
  try { const r = await fetch(`${ENGINE}/speakers`); const list = await r.json() as { name: string; styles: { id: number; name: string }[] }[]; for (const sp of list) for (const st of sp.styles) if (st.id === SPEAKER) return `${sp.name}（${st.name}）`; } catch { /* ignore */ }
  return `speaker ${SPEAKER}`;
}
async function synth(text: string): Promise<Buffer> {
  const q = await fetchRetry(`${ENGINE}/audio_query?speaker=${SPEAKER}&text=${encodeURIComponent(text)}`, { method: 'POST' });
  const query = await q.json() as Record<string, unknown>;
  query.speedScale = 1.08; query.intonationScale = 1.2; query.volumeScale = 1.0; query.prePhonemeLength = 0.05; query.postPhonemeLength = 0.1; query.outputSamplingRate = 24000;
  const r = await fetchRetry(`${ENGINE}/synthesis?speaker=${SPEAKER}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
  return Buffer.from(await r.arrayBuffer());
}

const todo = lines.filter(t => !(manifest.files[t] && existsSync(path.join(OUT, manifest.files[t]))));
console.log(`voice bank: ${lines.length} lines, ${todo.length} to synthesize (engine ${ENGINE}, speaker ${SPEAKER}, ${FORMAT})`);
const name = await speakerName(); manifest.credit = `VOICEVOX:${name.replace(/（.*$/, '')}`;
let done = 0, failed = 0; const t0 = Date.now();
async function worker() {
  for (;;) {
    const text = todo.shift(); if (text === undefined) return;
    try {
      const wav = await synth(text); const base = id(text);
      const wavPath = path.join(OUT, `${base}.wav`); writeFileSync(wavPath, wav);
      let file = `${base}.wav`;
      if (FORMAT === 'mp3') { const mp3 = path.join(OUT, `${base}.mp3`); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-ac', '1', '-ar', '24000', '-codec:a', 'libmp3lame', '-b:a', '40k', mp3]); execFileSync('rm', ['-f', wavPath]); file = `${base}.mp3`; }
      manifest.files[text] = file; done++;
      if (done % 50 === 0) { writeFileSync(manifestPath, JSON.stringify(manifest)); console.log(`  ${done}/${done + todo.length + failed} (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }
    } catch (e) { failed++; console.warn('  failed:', text, String(e).slice(0, 120)); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`done: ${done} synthesized, ${failed} failed, ${Object.keys(manifest.files).length} in bank, credit "${manifest.credit}" (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
if (failed > todo.length + done) process.exit(1);
