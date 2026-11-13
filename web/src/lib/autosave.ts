import { useCallback, useEffect, useRef, useState } from 'react';
import { useDirty } from './dirty';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Debounced autosave. `value` is compared with what was last saved; changes are written after `delay` ms of quiet.
 * While a change is unsaved the editor is registered as dirty, so closing it asks first.
 */
export function useAutosave<T>(key: string, value: T | null, save: (v: T) => Promise<unknown>, delay = 1200) {
  const [state, setState] = useState<SaveState>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const last = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const serialized = value === null ? null : JSON.stringify(value);

  // First value seen is the saved baseline.
  if (last.current === null && serialized !== null) last.current = serialized;
  const isDirty = serialized !== null && serialized !== last.current;
  useDirty(key, isDirty);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (serialized === null || serialized === last.current) return true;
    setState('saving');
    try {
      await save(JSON.parse(serialized) as T);
      last.current = serialized;
      setState('saved'); setSavedAt(new Date()); setError('');
      return true;
    } catch (e) {
      setState('error'); setError((e as Error).message);
      return false;
    }
  }, [serialized, save]);

  useEffect(() => {
    if (!isDirty) return undefined;
    setState('pending');
    timer.current = window.setTimeout(() => { flush(); }, delay);
    return () => window.clearTimeout(timer.current);
  }, [serialized]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Accept a server-normalized value as the new saved baseline. */
  const rebase = useCallback((v: T) => { last.current = JSON.stringify(v); }, []);
  return { state, savedAt, error, flush, rebase, isDirty };
}
