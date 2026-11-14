import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/**
 * A single-line text field that wraps long values onto further lines (instead of scrolling them out of view)
 * and grows to fit. Line breaks are never stored; Ctrl+Enter submits the surrounding form.
 */
export function AutoText({ value, onChange, className = '', onKeyDown, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string; onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea ref={ref} rows={1} className={`input autogrow ${className}`} value={value} spellCheck
      onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={(e) => {
        // No line breaks are stored, so Enter never inserts one. Ctrl+Enter saves; inside a pop-up the overlay
        // handles that (it runs first), elsewhere the field submits its own form.
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if ((e.ctrlKey || e.metaKey) && !e.currentTarget.closest('.overlay')) e.currentTarget.form?.requestSubmit();
        }
        onKeyDown?.(e);
      }}
      {...rest} />
  );
}
