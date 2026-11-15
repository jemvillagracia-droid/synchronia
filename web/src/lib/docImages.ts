// Pictures in word-processor documents. Every picture is stored in SYNCHRONIA (documents never depend on outside
// links): PNG, JPEG and GIF are uploaded as they are (GIFs keep their animation); any other picture the app can
// display (WebP, AVIF, BMP…) is converted to PNG first, because Word documents cannot hold those formats.
import type { Editor } from '@tiptap/react';

export const LOCAL = /^\/api\/doc-images\/\d+$/;
const KEEP = new Set(['image/png', 'image/jpeg', 'image/gif']);
export const MAX_MB = 15;

export interface Stored { id: number; src: string; width: number | null; height: number | null }

async function toPng(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be converted.'))), 'image/png'));
}

async function post(path: string, body: BodyInit, headers: Record<string, string>): Promise<Stored> {
  const res = await fetch(`/api/doc-images${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Synchronia': '1', ...headers }, body });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `The picture could not be saved (${res.status}).`);
  return d;
}

/** Store a picture file or clipboard blob. */
export async function storePicture(blob: Blob, name = 'picture'): Promise<Stored> {
  if (blob.size > MAX_MB * 1024 * 1024) throw new Error(`“${name}” is larger than ${MAX_MB} MB.`);
  const data = KEEP.has(blob.type) ? blob : await toPng(blob);
  return post('', data, { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(name) });
}

/** Store a picture referenced by a data: URL, blob: URL or web address (as in HTML pasted from Word or a web page). */
/** Decode a data: URL without fetch (the app's security policy only lets it talk to SYNCHRONIA itself). */
function dataUrlBlob(src: string): Blob {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(src);
  if (!m) throw new Error('This picture cannot be read.');
  const bytes = m[2] ? Uint8Array.from(atob(m[3]), (ch) => ch.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3]));
  return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
}

export async function storeFromSrc(src: string): Promise<Stored> {
  if (/^data:/i.test(src)) return storePicture(dataUrlBlob(src), 'pasted picture');
  if (/^blob:/i.test(src)) {
    // A blob: picture can be displayed but not fetched under the security policy: draw it and store it as PNG.
    const img = new window.Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    const png = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be read.'))), 'image/png'));
    return storePicture(png, 'pasted picture');
  }
  if (/^https?:\/\//i.test(src)) return post('/from-url', JSON.stringify({ url: src }), { 'Content-Type': 'application/json' });
  throw new Error('This picture cannot be copied in.');
}

/** Insert stored pictures at a position (or the selection). */
export function insertPictures(editor: Editor, pics: Stored[], pos?: number) {
  const nodes = pics.map((p) => ({ type: 'image', attrs: { src: p.src, width: p.width && p.width < 300 ? null : 100 } }));
  // With a picture (or another whole block) selected, insert after it — never replace it.
  const sel = editor.state.selection as { node?: unknown; to: number };
  const at = pos ?? (sel.node ? sel.to : null);
  const chain = editor.chain().focus();
  (at != null ? chain.insertContentAt(at, nodes) : chain.insertContent(nodes)).run();
}

/**
 * Pictures that came in as outside references (pasted HTML) are stored in SYNCHRONIA and their nodes repointed.
 * Any that cannot be stored are removed (they would not survive saving) and counted.
 */
export async function localizePictures(editor: Editor): Promise<{ stored: number; failed: number }> {
  const foreign = new Set<string>();
  editor.state.doc.descendants((n) => { if (n.type.name === 'image' && n.attrs.src && !LOCAL.test(n.attrs.src)) foreign.add(n.attrs.src); });
  let stored = 0; let failed = 0;
  for (const src of foreign) {
    let to: string | null = null;
    try { to = (await storeFromSrc(src)).src; stored += 1; } catch { failed += 1; }
    if (editor.isDestroyed) break;
    const tr = editor.state.tr;
    const hits: { pos: number; size: number }[] = [];
    editor.state.doc.descendants((n, pos) => { if (n.type.name === 'image' && n.attrs.src === src) hits.push({ pos, size: n.nodeSize }); });
    for (const h of hits.reverse()) {
      if (to) tr.setNodeMarkup(h.pos, undefined, { ...editor.state.doc.nodeAt(h.pos)!.attrs, src: to });
      else tr.delete(h.pos, h.pos + h.size);
    }
    if (hits.length) editor.view.dispatch(tr);
  }
  return { stored, failed };
}

// Copying pictures out: other programs cannot read SYNCHRONIA's picture addresses, so copied HTML carries the
// picture itself (as a data URL). Pictures in the open document are read in the background for that.
const dataUrls = new Map<string, string>();
export function rememberPictures(srcs: string[]) {
  for (const src of srcs) {
    if (dataUrls.has(src) || !LOCAL.test(src)) continue;
    dataUrls.set(src, '');
    fetch(src, { credentials: 'same-origin' }).then((r) => r.blob()).then((b) => new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); }))
      .then((d) => dataUrls.set(src, d)).catch(() => dataUrls.delete(src));
  }
}
export const portableSrc = (src: string) => dataUrls.get(src) || src;
