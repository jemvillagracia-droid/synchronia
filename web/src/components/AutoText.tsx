import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/**
 * A single-line text field that wraps long values onto further lines (instead of scrolling them out of view)
 * and grows to fit. Enter submits the surrounding form, as in a normal input; line breaks are never stored.
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
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
        onKeyDown?.(e);
      }}
      {...rest} />
  );
}
