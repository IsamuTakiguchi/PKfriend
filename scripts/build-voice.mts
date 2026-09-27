// Synthesize every commentary line with a VOICEVOX-compatible engine and write a static voice bank
// (client/public/voice/<hash>.mp3 + manifest.json). Usage:
//   npx tsx scripts/build-voice.mts --engine http://127.0.0.1:50021 --speaker-name 青山龍星 [--speaker 13] [--out client/public/voice] [--format mp3|wav] [--limit N]
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { allLines, moodOf, type Mood } from '../shared/src/index.js';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const ENGINE = arg('engine', 'http://127.0.0.1:50021').replace(/\/$/, '');
const SPEAKER_NAME = arg('speaker-name', '青山龍星');
const SPEAKER = Number(arg('speaker', '13')); // fallback style id when the name cannot be resolved
const OUT = arg('out', 'client/public/voice');
const FORMAT = arg('format', 'mp3');
const LIMIT = Number(arg('limit', '0'));
const CONC = Number(arg('concurrency', '3'));
mkdirSync(OUT, { recursive: true });

const id = (text: string) => createHash('sha1').update(`${SPEAKER_NAME}:${SPEAKER}\n${moodOf(text)}\n${text}`).digest('hex').slice(0, 14);
let lines = allLines(); if (LIMIT) lines = lines.slice(0, LIMIT);
const manifestPath = path.join(OUT, 'manifest.json');
const manifest: { speaker: number | string; format: string; credit: string; files: Record<string, string> } = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { speaker: SPEAKER_NAME, format: FORMAT, credit: '', files: {} };
manifest.speaker = SPEAKER_NAME; manifest.format = FORMAT;

async function fetchRetry(url: string, init: RequestInit, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) { try { const r = await fetch(url, init); if (r.ok) return r; if (i >= tries - 1) throw new Error(`${r.status} ${url}`); } catch (e) { if (i >= tries - 1) throw e; } await new Promise(r => setTimeout(r, 800 * (i + 1))); }
}
// style names per mood for the chosen speaker (resolved against /speakers; falls back to the numeric speaker id)
const STYLE_FOR: Record<Mood, string[]> = { hot: ['熱血', 'ツンギレ', 'ノーマル'], joy: ['喜び', 'ノーマル'], sad: ['かなしみ', '悲しみ', 'しっとり', 'ノーマル'], normal: ['ノーマル'] };
// expression settings per mood: more pitch movement for the excited lines, calmer delivery for guidance and sad lines
const PARAMS: Record<Mood, { speedScale: number; intonationScale: number; pitchScale: number; volumeScale: number }> = {
  hot: { speedScale: 1.14, intonationScale: 1.75, pitchScale: 0.02, volumeScale: 1.1 },
  joy: { speedScale: 1.1, intonationScale: 1.65, pitchScale: 0.03, volumeScale: 1.1 },
  sad: { speedScale: 0.97, intonationScale: 1.3, pitchScale: -0.02, volumeScale: 1.0 },
  normal: { speedScale: 1.06, intonationScale: 1.45, pitchScale: 0, volumeScale: 1.0 },
};
let styleIds: Record<Mood, number> = { hot: SPEAKER, joy: SPEAKER, sad: SPEAKER, normal: SPEAKER };
let creditName = SPEAKER_NAME;
async function resolveSpeaker() {
  try {
    const r = await fetch(`${ENGINE}/speakers`); const list = await r.json() as { name: string; styles: { id: number; name: string }[] }[];
    const sp = list.find(x => x.name === SPEAKER_NAME) ?? list.find(x => x.styles.some(st => st.id === SPEAKER));
    if (!sp) return; creditName = sp.name;
    for (const mood of Object.keys(STYLE_FOR) as Mood[]) { const st = STYLE_FOR[mood].map(n => sp.styles.find(x => x.name === n)).find(Boolean) ?? sp.styles[0]; styleIds[mood] = st.id; }
    console.log('speaker:', sp.name, 'styles:', Object.entries(styleIds).map(([m, i]) => `${m}=${sp.styles.find(x => x.id === i)?.name}(${i})`).join(' '));
  } catch (e) { console.warn('could not resolve speaker styles, using id', SPEAKER, String(e).slice(0, 80)); }
}
async function synth(text: string): Promise<Buffer> {
  const mood = moodOf(text); const sid = styleIds[mood]; const prm = PARAMS[mood];
  const q = await fetchRetry(`${ENGINE}/audio_query?speaker=${sid}&text=${encodeURIComponent(text)}`, { method: 'POST' });
  const query = await q.json() as Record<string, unknown>;
  Object.assign(query, prm, { prePhonemeLength: 0.04, postPhonemeLength: 0.12, outputSamplingRate: 24000 });
  const r = await fetchRetry(`${ENGINE}/synthesis?speaker=${sid}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
  return Buffer.from(await r.arrayBuffer());
}

// ffmpeg is required for mp3; fail fast (before spending time on synthesis) if it is missing
if (FORMAT === 'mp3') { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { console.error('ffmpeg not found: install it (e.g. sudo apt-get install -y ffmpeg) or pass --format wav'); process.exit(2); } }
// reuse files that already exist on disk (e.g. from a previous partial run) even if the manifest lost them
for (const t of lines) { if (manifest.files[t] && existsSync(path.join(OUT, manifest.files[t]))) continue; const base = id(t); if (existsSync(path.join(OUT, `${base}.${FORMAT}`))) manifest.files[t] = `${base}.${FORMAT}`; }
const todo = lines.filter(t => !(manifest.files[t] && existsSync(path.join(OUT, manifest.files[t]))));
console.log(`voice bank: ${lines.length} lines, ${todo.length} to synthesize (engine ${ENGINE}, speaker ${SPEAKER_NAME}, ${FORMAT})`);
await resolveSpeaker(); manifest.credit = `VOICEVOX:${creditName}`;
let done = 0, failed = 0; const t0 = Date.now();
async function worker() {
  for (;;) {
    const text = todo.shift(); if (text === undefined) return;
    try {
      const base = id(text); const wavPath = path.join(OUT, `${base}.wav`);
      if (!existsSync(wavPath)) { const wav = await synth(text); writeFileSync(wavPath, wav); }
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
