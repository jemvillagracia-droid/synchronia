// Renders the alarm music from scripts/alarm/score.ts in Chromium's audio engine and saves lossless FLAC files to
// web/public/sounds. The battle march is written with its exact loop length, so it repeats without a gap.
//   node scripts/alarm/render.cjs        (needs Playwright's Chromium and ffmpeg)
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..'); const OUT = path.join(ROOT, 'web', 'public', 'sounds');
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alarm-'));
  execFileSync(path.join(ROOT, 'node_modules', '.bin', 'esbuild'), [path.join(__dirname, 'score.ts'), '--bundle', '--format=iife', '--global-name=Score', `--outfile=${tmp}/score.js`]);
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<html></html>'); await p.addScriptTag({ path: `${tmp}/score.js` });
  const files = await p.evaluate(async () => {
    const pcm = (buf) => { const L = buf.getChannelData(0), R = buf.getChannelData(1); const out = new Int16Array(buf.length * 2); for (let i = 0; i < buf.length; i++) { out[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; out[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; } return Array.from(new Uint8Array(out.buffer)); };
    return { 'battle-loop': pcm(await Score.renderBattleLoop()), warning: pcm(await Score.renderWarning()), restored: pcm(await Score.renderRestored()) };
  });
  await b.close();
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    const raw = `${tmp}/${name}.raw`; fs.writeFileSync(raw, Buffer.from(bytes));
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 's16le', '-ar', '44100', '-ac', '2', '-i', raw, '-c:a', 'flac', '-compression_level', '12', path.join(OUT, `${name}.flac`)]);
    console.log(`${name}.flac  ${(fs.statSync(path.join(OUT, `${name}.flac`)).size / 1024).toFixed(0)} KB  ${bytes.length / 4} samples`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.error(e); process.exit(1); });
