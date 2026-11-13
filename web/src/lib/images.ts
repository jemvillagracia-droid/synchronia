import type { Photo } from './cv';

export const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (v: any) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/imageWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
  }
  return worker;
}

function run<T>(msg: Record<string, any>): Promise<T> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, (r) => (r.ok ? resolve(r) : reject(new Error(r.error))));
    getWorker().postMessage({ ...msg, id });
  });
}

export const makePreview = (blob: Blob, dims?: { width: number; height: number }, maxSide = 1400) =>
  run<{ blob: Blob; width: number; height: number; previewWidth: number; previewHeight: number }>({ op: 'preview', blob, maxSide, ...(dims || {}) });

export const cropToJpeg = (blob: Blob, crop: { x: number; y: number; width: number; height: number }, maxSide = 1000, quality = 0.88) =>
  run<{ blob: Blob; width: number; height: number }>({ op: 'crop', blob, crop, maxSide, quality });

export function checkFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return `“${file.name}” is not a JPEG, PNG or WebP image.`;
  if (file.size > MAX_IMAGE_BYTES) return `“${file.name}” is ${(file.size / 1048576).toFixed(1)} MB. The limit is 100 MB per image.`;
  if (!file.size) return `“${file.name}” is empty.`;
  return null;
}

/** Raw upload with progress (fetch cannot report upload progress). */
export function sendImage(url: string, body: Blob, type: string, headers: Record<string, string>, onProgress?: (f: number) => void, method = 'POST'): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    x.setRequestHeader('Content-Type', type);
    x.setRequestHeader('X-Synchronia', '1');
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onload = () => {
      let data: any = null;
      try { data = JSON.parse(x.responseText); } catch { /* ignore */ }
      if (x.status >= 200 && x.status < 300) resolve(data);
      else reject(new Error(data?.error || `Upload failed (${x.status})`));
    };
    x.onerror = () => reject(new Error('The upload was interrupted.'));
    x.send(body);
  });
}
