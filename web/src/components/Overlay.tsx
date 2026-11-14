import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Accessible overlay: Escape closes, click on the scrim closes, focus is trapped and restored.
 *
 * The setup runs once, when the overlay opens. Callers usually pass a new onClose function on every render, and
 * every keystroke in a form re-renders it; tying the setup to onClose made each keystroke tear the overlay down and
 * set it up again, which moved focus to the first control (often the Close button) mid-typing, so the next Space or
 * Enter closed the pop-up. The latest onClose is read from a ref instead.
 */
export function Overlay({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusable = () => Array.from(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || [])
      .filter((n) => !n.hasAttribute('disabled'));
    const first = el?.querySelector<HTMLElement>('[autofocus], [data-autofocus]') || focusable()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Only Escape and Tab mean anything to the overlay; every other key (Shift, letters, Enter…) belongs to the
      // field being typed in. Escape while an input method is composing text belongs to the input method.
      if (e.key === 'Escape' && !e.isComposing) {
        // Only the topmost overlay closes.
        const overlays = document.querySelectorAll('.overlay');
        if (overlays[overlays.length - 1] !== el) return;
        e.stopPropagation(); close.current();
      }
      // Enter in a pop-up never submits by accident: plain Enter in a text field does nothing (fields that act on
      // Enter, like a search box, handle it themselves), and Ctrl+Enter saves the form.
      if (e.key === 'Enter' && !e.isComposing && el?.contains(e.target as Node)) {
        const t = e.target as HTMLElement;
        const form = (t as HTMLInputElement).form || t.closest('form');
        if ((e.ctrlKey || e.metaKey) && form) { e.preventDefault(); e.stopPropagation(); form.requestSubmit(); return; }
        if (t.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio', 'file'].includes((t as HTMLInputElement).type)) e.preventDefault();
      }
      if (e.key === 'Tab') {
        const f = focusable();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  // A press that starts inside the dialog and ends on the scrim (selecting text, dragging) must not close it:
  // only a press that both starts and ends on the scrim does.
  const downOnScrim = useRef(false);
  return createPortal(
    <div className="overlay" role="dialog" aria-modal="true" aria-label={label} ref={ref}
      onMouseDown={(e) => { downOnScrim.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (downOnScrim.current && e.target === e.currentTarget) close.current(); downOnScrim.current = false; }}>
      {children}
    </div>,
    document.body,
  );
}
