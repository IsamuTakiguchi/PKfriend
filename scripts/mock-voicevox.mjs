// Tiny VOICEVOX-compatible mock for testing the voice bank pipeline offline: returns a short beep WAV for any text.
import http from 'node:http';
const port = Number(process.argv[2] || 50021);
function wav(seconds = 0.4, freq = 220) { const sr = 24000, n = Math.floor(sr * seconds); const b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * i / sr) * 8000 * (1 - i / n)), 44 + i * 2); return b; }
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/version') { res.end('"mock"'); return; }
  if (u.pathname === '/speakers') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([{ name: '玄野武宏', styles: [{ id: 11, name: 'ノーマル' }] }])); return; }
  if (u.pathname === '/audio_query') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ accent_phrases: [], speedScale: 1 })); return; }
  if (u.pathname === '/synthesis') { let body = ''; req.on('data', c => body += c); req.on('end', () => { res.setHeader('Content-Type', 'audio/wav'); res.end(wav(0.3 + Math.random() * 0.4)); }); return; }
  res.statusCode = 404; res.end();
}).listen(port, () => console.log('mock voicevox on', port));
