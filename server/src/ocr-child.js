// Helper process for reading text from pictures (Tesseract OCR). It runs apart from SYNCHRONIA so that a crash or
// hang in the OCR engine can only fail one import, never the app. Started on demand; exits after a minute idle.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const unpacked = (p) => p.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
const LANG_DIR = unpacked(path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'));

let worker = null; let idle = null;
const bye = () => { Promise.resolve(worker?.terminate()).finally(() => process.exit(0)); };
async function getWorker() {
  if (!worker) {
    const { createWorker } = await import('tesseract.js');
    const cachePath = path.join(process.env.SYNCHRONIA_DATA_DIR || os.tmpdir(), 'ocr-cache');
    fs.mkdirSync(cachePath, { recursive: true });
    worker = await createWorker('eng', 1, { langPath: LANG_DIR, cachePath, gzip: true, logger: () => {}, errorHandler: () => {} });
  }
  return worker;
}
process.on('message', async ({ id, data }) => {
  clearTimeout(idle);
  try {
    const w = await getWorker();
    const { data: r } = await w.recognize(Buffer.from(data, 'base64'));
    process.send({ id, lines: String(r.text || '').split(/\r?\n/), confidence: Math.round(r.confidence || 0) });
  } catch (e) {
    process.send({ id, error: String(e?.message || e).slice(0, 300) });
    worker = null; // start the engine afresh next time
  }
  idle = setTimeout(bye, 60_000);
});
process.on('disconnect', bye);
idle = setTimeout(bye, 60_000);
