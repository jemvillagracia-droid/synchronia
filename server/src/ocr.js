// Reading text from pictures, offline: the Tesseract engine and its English model ship with SYNCHRONIA and nothing is
// sent anywhere. The engine runs in a helper process (ocr-child.js), so a crash or hang there can only fail one import:
// each read has a time limit, and a helper that dies is simply started again next time.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHILD = fileURLToPath(new URL('./ocr-child.js', import.meta.url));
const LIMIT_MS = 90_000;

/** What a picture file is, from its first bytes (not its name). */
export function pictureKind(buffer) {
  const b = buffer.subarray(0, 12);
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('latin1', 0, 2) === 'BM') return 'bmp';
  if (b.toString('latin1', 0, 4) === 'II*\u0000' || b.toString('latin1', 0, 4) === 'MM\u0000*') return 'tiff';
  if (b.toString('latin1', 0, 3) === 'GIF') return 'gif';
  if (b.toString('latin1', 4, 12).startsWith('ftyphei') || b.toString('latin1', 4, 12).startsWith('ftypmif')) return 'heic';
  return null;
}

let child = null; let seq = 0;
const pending = new Map();
function helper() {
  if (child && child.connected) return child;
  // In the desktop app process.execPath is the app itself; ELECTRON_RUN_AS_NODE makes the helper a plain Node process.
  child = fork(CHILD, [], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced' });
  const me = child;
  me.on('message', (m) => { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer); if (m.error) p.reject(new Error(m.error)); else p.resolve(m); });
  const fail = (why) => { if (child === me) child = null; for (const [id, p] of pending) { clearTimeout(p.timer); p.reject(new Error(why)); pending.delete(id); } };
  me.on('exit', () => fail('The picture reader stopped unexpectedly.'));
  me.on('error', () => fail('The picture reader could not start.'));
  me.unref(); me.channel?.unref?.();
  return me;
}

/** Text lines read from a picture, with the engine's overall confidence (0–100). */
export function readPicture(buffer) {
  return new Promise((resolve, reject) => {
    const id = ++seq; const c = helper();
    const timer = setTimeout(() => { pending.delete(id); c.kill(); reject(new Error('Reading the picture took too long.')); }, LIMIT_MS);
    pending.set(id, { resolve: (m) => resolve({ lines: m.lines, confidence: m.confidence }), reject, timer });
    c.ref(); c.channel?.ref?.();
    c.send({ id, data: buffer.toString('base64') }, (err) => { if (err) { clearTimeout(timer); pending.delete(id); reject(err); } });
    const done = () => { if (!pending.size) { c.unref(); c.channel?.unref?.(); } };
    const p = pending.get(id); const res = p.resolve; const rej = p.reject;
    p.resolve = (m) => { res(m); done(); }; p.reject = (e) => { rej(e); done(); };
  });
}
