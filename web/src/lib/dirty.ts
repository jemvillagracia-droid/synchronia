// Tracks editors with unsaved changes so closing a pop-up or the window never silently discards work.
import { useEffect } from 'react';

const dirty = new Set<string>();

export const setDirty = (key: string, isDirty: boolean) => { if (isDirty) dirty.add(key); else dirty.delete(key); };
export const hasUnsaved = () => dirty.size > 0;

// The desktop shell turns a prevented unload into a "Leave without saving?" dialog.
window.addEventListener('beforeunload', (e) => {
  if (dirty.size) { e.preventDefault(); e.returnValue = ''; }
});

/** Register an editor's dirty state for the lifetime of the component. */
export function useDirty(key: string, isDirty: boolean) {
  useEffect(() => { setDirty(key, isDirty); }, [key, isDirty]);
  useEffect(() => () => setDirty(key, false), [key]);
}

export const confirmDiscard = () => window.confirm('You have unsaved changes. Discard them?');
