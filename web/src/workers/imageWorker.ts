// Decodes, crops, resizes and re-encodes photographs off the main thread, so large files never freeze the app.
/// <reference lib="webworker" />
type Req =
  | { id: number; op: 'preview'; blob: Blob; maxSide: number; width?: number; height?: number }
  | { id: number; op: 'crop'; blob: Blob; crop: { x: number; y: number; width: number; height: number }; maxSide: number; quality: number };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<Req>) => {
  const msg = e.data;
  try {
    let bmp: ImageBitmap;
    if (msg.op === 'preview') {
      // Dimensions come from the server's header inspection when known, avoiding a full-size decode.
      let width = msg.width || 0, height = msg.height || 0;
      if (!width || !height) { const probe = await createImageBitmap(msg.blob); width = probe.width; height = probe.height; probe.close(); }
      const s = Math.min(1, msg.maxSide / Math.max(width, height));
      bmp = await createImageBitmap(msg.blob, { resizeWidth: Math.round(width * s), resizeHeight: Math.round(height * s), resizeQuality: 'high' });
      const blob = await encode(bmp, 'image/jpeg', 0.9);
      ctx.postMessage({ id: msg.id, ok: true, blob, width, height, previewWidth: bmp.width, previewHeight: bmp.height });
      bmp.close();
      return;
    }
    const c = msg.crop;
    const s = Math.min(1, msg.maxSide / Math.max(c.width, c.height));
    bmp = await createImageBitmap(msg.blob, Math.round(c.x), Math.round(c.y), Math.round(c.width), Math.round(c.height),
      { resizeWidth: Math.max(1, Math.round(c.width * s)), resizeHeight: Math.max(1, Math.round(c.height * s)), resizeQuality: 'high' });
    const blob = await encode(bmp, 'image/jpeg', msg.quality);
    ctx.postMessage({ id: msg.id, ok: true, blob, width: bmp.width, height: bmp.height });
    bmp.close();
  } catch (err) {
    ctx.postMessage({ id: msg.id, ok: false, error: (err as Error).message || 'The image could not be decoded.' });
  }
};

async function encode(bmp: ImageBitmap, type: string, quality: number) {
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff'; // transparent PNG areas become white, not black
  g.fillRect(0, 0, bmp.width, bmp.height);
  g.drawImage(bmp, 0, 0);
  return canvas.convertToBlob({ type, quality });
}
