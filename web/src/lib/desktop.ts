// Bridge to the Electron shell (see desktop/preload.cjs). Null when the client runs outside the desktop app.
export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  version: string;
  dataDir: string;
  pickFile: () => Promise<string | null>;
  openPath: (p: string) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  showDataFolder: () => Promise<void>;
  showItemInFolder: (p: string) => Promise<void>;
  relaunch: () => Promise<void>;
  /** Native editing command (same as the keyboard shortcut). */
  edit?: (action: 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'selectAll' | 'undo' | 'redo' | 'delete') => Promise<void>;
  onDownload: (cb: (info: { state: 'completed' | 'cancelled' | 'interrupted'; name: string; path?: string }) => void) => () => void;
}

export const desktop: DesktopBridge | null = (window as unknown as { synchronia?: DesktopBridge }).synchronia ?? null;

/** Open a web link or a local file reference in the right place. */
export async function openReference(provider: string, url: string | null): Promise<string | null> {
  if (!url) return 'No location recorded';
  if (provider === 'local_path') {
    if (!desktop) return 'Local files can only be opened from the SYNCHRONIA desktop app';
    const err = await desktop.openPath(url);
    return err || null;
  }
  if (!/^https?:\/\//i.test(url)) return 'Not a web address';
  if (desktop) await desktop.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
  return null;
}
