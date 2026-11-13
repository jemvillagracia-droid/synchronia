import type { SaveState } from '../lib/autosave';
import { fmtTime12 } from '../lib/format';

export function SaveIndicator({ state, savedAt, error }: { state: SaveState; savedAt: Date | null; error?: string }) {
  const text = state === 'saving' ? 'Saving…' : state === 'pending' ? 'Unsaved changes — saving shortly'
    : state === 'error' ? `Not saved: ${error || 'error'}` : savedAt ? `All changes saved · ${fmtTime12(savedAt)}` : 'All changes saved';
  return <span className={`save-ind ${state}`} role="status" aria-live="polite">{text}</span>;
}
