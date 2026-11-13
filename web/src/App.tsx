import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, Link } from 'react-router-dom';
import { api, onUnauthorized } from './lib/api';
import type { AuthState, User } from './lib/types';
import { MODULES } from './lib/modules';
import { AppProvider } from './components/AppContext';
import { Shell } from './components/Shell';
import { QuickCapture } from './components/QuickCapture';
import { SearchPalette } from './components/SearchPalette';
import { RecordDrawer } from './components/RecordDrawer';
import { BrandMark } from './components/Icon';
import { AuthScreen } from './pages/AuthScreen';
import { NexusPage } from './pages/Nexus';
import { ModulePage } from './pages/ModulePage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  return (
    <div className="page">
      <div className="label" style={{ color: 'var(--orange)' }}>Signal lost</div>
      <h1 className="display" style={{ fontSize: 'var(--fs-3xl)' }}>Page not found</h1>
      <Link to="/" className="btn mt-4">Return to the Central Nexus</Link>
    </div>
  );
}

function Boot() {
  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }} aria-busy="true">
      <div className="stack" style={{ alignItems: 'center' }}>
        <BrandMark className="brand-mark" />
        <span className="label">Synchronizing…</span>
      </div>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [bootError, setBootError] = useState('');

  const refresh = useCallback(() => {
    api.get<AuthState>('/auth/state').then(setAuth).catch(() => setBootError('The SYNCHRONIA server is not responding.'));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onUnauthorized(() => setAuth((a) => (a ? { ...a, user: null } : a))), []);

  if (bootError) return <div className="page"><div className="alert">{bootError} Start it with <code>npm run dev</code> and reload.</div></div>;
  if (!auth) return <Boot />;
  if (!auth.user) {
    return <AuthScreen setup={auth.setupRequired} onAuthed={(user: User) => setAuth({ setupRequired: false, user })} />;
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider key={auth.user.id} user={auth.user} onLogout={() => setAuth({ setupRequired: false, user: null })}>
        {({ toasts, capture, setCapture, search, setSearch, record, setRecord }) => (
          <>
            <Shell>
              <Routes>
                <Route path="/" element={<NexusPage />} />
                <Route path="/portfolio/profile" element={<ProfilePage />} />
                {MODULES.filter((m) => m.id !== 'nexus').map((m) => <Route key={m.id} path={m.path} element={<ModulePage mod={m} />} />)}
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Shell>
            {capture && <QuickCapture onClose={() => setCapture(false)} />}
            {search && <SearchPalette onClose={() => setSearch(false)} />}
            {record && <RecordDrawer key={`${record.type}-${record.id}`} type={record.type} id={record.id} onClose={() => setRecord(null)} />}
            <div className="toasts" aria-live="polite">
              {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
            </div>
          </>
        )}
      </AppProvider>
    </BrowserRouter>
  );
}
