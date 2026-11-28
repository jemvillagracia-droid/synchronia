// "Decoding" page titles: for a moment the title shows scrambled system glyphs that resolve left to right into the real
// text, like a terminal coming online. Drawn in a fixed overlay above the heading so React's own text is never touched.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/\\[]{}';

export function decodeHeading(el: HTMLElement | null, ms = 520) {
  if (!el || !el.isConnected) return;
  if (document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const text = el.textContent || '';
  if (!text.trim() || text.length > 80) return;
  const r = el.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
  const cs = getComputedStyle(el);
  const o = document.createElement('div');
  o.setAttribute('aria-hidden', 'true');
  o.className = 'decode-overlay';
  Object.assign(o.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, minHeight: `${r.height}px`, margin: '0', pointerEvents: 'none', zIndex: '40',
    font: cs.font, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, color: cs.color, lineHeight: cs.lineHeight, textAlign: cs.textAlign, whiteSpace: cs.whiteSpace,
  });
  document.body.appendChild(o);
  el.classList.add('decoding');
  const start = performance.now();
  let raf = 0;
  const frame = (t: number) => {
    const p = Math.min(1, (t - start) / ms);
    const fixed = Math.floor(text.length * p);
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      out += i < fixed || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    o.textContent = out;
    if (p < 1) raf = requestAnimationFrame(frame);
    else { o.remove(); el.classList.remove('decoding'); }
  };
  raf = requestAnimationFrame(frame);
  // Safety: never leave the heading hidden.
  window.setTimeout(() => { cancelAnimationFrame(raf); o.remove(); el.classList.remove('decoding'); }, ms + 400);
}
