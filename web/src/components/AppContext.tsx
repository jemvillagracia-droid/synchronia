import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Preferences, Schema, User } from '../lib/types';

interface Toast { id: number; kind: 'info' | 'ok' | 'error'; text: string }

interface Ctx {
  user: User;
  prefs: Preferences | null;
  schema: Schema | null;
  profileName: string | null;
  setProfileName: (n: string | null) => void;
  updatePrefs: (patch: Partial<Omit<Preferences, 'dashboard_layout'>> & { dashboard_layout?: Preferences['dashboard_layout'] | null }) => Promise<Preferences>;
  toast: (text: string, kind?: Toast['kind']) => void;
  openCapture: () => void;
  openSearch: () => void;
  openRecord: (type: string, id: number) => void;
  openNew: (type: string) => void;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
};

interface ProviderProps {
  user: User;
  children: (ui: {
    toasts: Toast[];
    capture: boolean; setCapture: (v: boolean) => void;
    search: boolean; setSearch: (v: boolean) => void;
    record: { type: string; id: number | null } | null; setRecord: (r: { type: string; id: number | null } | null) => void;
  }) => ReactNode;
}

export function AppProvider({ user, children }: ProviderProps) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [capture, setCapture] = useState(false);
  const [search, setSearch] = useState(false);
  const [record, setRecord] = useState<{ type: string; id: number | null } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    api.get<Preferences>('/preferences').then(setPrefs).catch(() => {});
    api.get<Schema>('/schema').then(setSchema).catch(() => {});
    api.get<{ full_name: string | null }>('/profile').then((p) => setProfileName(p.full_name)).catch(() => {});
  }, []);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);

  const updatePrefs = useCallback(async (patch: Parameters<Ctx['updatePrefs']>[0]) => {
    const next = await api.put<Preferences>('/preferences', patch);
    setPrefs(next);
    return next;
  }, []);

  const value: Ctx = {
    user, prefs, schema, profileName, setProfileName, updatePrefs, toast,
    openCapture: () => setCapture(true),
    openSearch: () => setSearch(true),
    openRecord: (type, id) => setRecord({ type, id }),
    openNew: (type) => setRecord({ type, id: null }),
  };

  return <AppCtx.Provider value={value}>{children({ toasts, capture, setCapture, search, setSearch, record, setRecord })}</AppCtx.Provider>;
}
