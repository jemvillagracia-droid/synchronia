import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Renders every page of a PDF (the exact exported document) to canvases. */
export function PdfPages({ data, zoom = 1, onPages }: { data: ArrayBuffer | null; zoom?: number; onPages?: (n: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!data || !host.current) return;
    let cancelled = false;
    const el = host.current;
    (async () => {
      try {
        const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), isEvalSupported: false }).promise;
        const canvases: HTMLCanvasElement[] = [];
        const width = Math.min(el.clientWidth - 32, 900) * zoom;
        for (let i = 1; i <= doc.numPages; i += 1) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const vp = page.getViewport({ scale: scale * window.devicePixelRatio });
          const c = document.createElement('canvas');
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          c.style.width = `${Math.floor(width)}px`; c.style.height = `${Math.floor(base.height * scale)}px`;
          c.className = 'pdf-page';
          c.setAttribute('role', 'img');
          c.setAttribute('aria-label', `Page ${i} of ${doc.numPages}`);
          await page.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
          if (cancelled) return;
          canvases.push(c);
        }
        if (cancelled) return;
        el.replaceChildren(...canvases.flatMap((c, i) => {
          const label = document.createElement('div');
          label.className = 'pdf-label';
          label.textContent = `Page ${i + 1} of ${canvases.length}`;
          return [c, label];
        }));
        onPages?.(doc.numPages);
        setError('');
        await doc.destroy();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [data, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {error && <div className="alert">Preview could not be drawn: {error}</div>}
      <div ref={host} className="pdf-pages" />
    </>
  );
}
