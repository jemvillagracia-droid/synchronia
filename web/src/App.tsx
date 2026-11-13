import { KnowledgePage } from './pages/KnowledgePage';
import { TimelinePage } from './pages/TimelinePage';
import { AdminPage } from './pages/admin/AdminPage';
import { IntelligencePage } from './pages/IntelligencePage';
import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, Link } from 'react-router-dom';
import { api, onUnauthorized } from './lib/api';
import type { User } from './lib/types';
import { MODULES } from './lib/modules';
import { AppProvider } from './components/AppContext';
import { Shell } from './components/Shell';
import { QuickCapture } from './components/QuickCapture';
import { SearchPalette } from './components/SearchPalette';
import { RecordDrawer } from './components/RecordDrawer';
import { BrandMark } from './components/Icon';
import { NexusPage } from './pages/Nexus';
import { ModulePage } from './pages/ModulePage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { PortfolioOverview, PortfolioCategoryPage } from './pages/PortfolioPage';
import { CvStudio } from './pages/cv/CvStudio';
import { CvEditor } from './pages/cv/CvEditor';
import { AcademicPage } from './pages/academic/AcademicPage';
import { CoursePage } from './pages/academic/CoursePage';
import { desktop } from './lib/desktop';

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

function Locked() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--s-6)' }}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', maxWidth: 440 }}>
        <BrandMark className="brand-mark" />
        <h1 className="display" style={{ fontSize: 48, margin: 0 }}>SYNCHRONIA</h1>
        <p className="muted">Your records are only available inside the SYNCHRONIA desktop app. Open it from the Start menu or desktop shortcut.</p>
      </div>
    </div>
  );
}

if (desktop) document.documentElement.dataset.desktop = desktop.platform;

export function App() {
  const [auth, setAuth] = useState<{ user: User | null } | null>(null);
  const [bootError, setBootError] = useState('');

  const refresh = useCallback(() => {
    api.get<{ user: User | null }>('/auth/state').then(setAuth).catch(() => setBootError('The SYNCHRONIA server is not responding.'));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onUnauthorized(() => setAuth({ user: null })), []);

  if (bootError) return <div className="page"><div className="alert">{bootError} Restart SYNCHRONIA.</div></div>;
  if (!auth) return <Boot />;
  if (!auth.user) return <Locked />;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider key={auth.user.id} user={auth.user}>
        {({ toasts, capture, setCapture, search, setSearch, record, setRecord }) => (
          <>
            <Shell>
              <Routes>
                <Route path="/" element={<NexusPage />} />
                <Route path="/portfolio" element={<PortfolioOverview />} />
                <Route path="/portfolio/profile" element={<ProfilePage />} />
                <Route path="/portfolio/timeline" element={<TimelinePage />} />
                <Route path="/portfolio/:category" element={<PortfolioCategoryPage />} />
                <Route path="/academic" element={<AcademicPage />} />
                <Route path="/academic/courses/:id" element={<CoursePage />} />
                <Route path="/cv" element={<CvStudio />} />
                <Route path="/cv/:id" element={<CvEditor />} />
                <Route path="/intelligence" element={<IntelligencePage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/knowledge" element={<KnowledgePage />} />
                {MODULES.filter((m) => !['nexus', 'portfolio', 'cv', 'academic', 'intelligence', 'admin', 'knowledge'].includes(m.id)).map((m) => <Route key={m.id} path={m.path} element={<ModulePage mod={m} />} />)}
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Shell>
            {capture && <QuickCapture onClose={() => setCapture(false)} />}
            {search && <SearchPalette onClose={() => setSearch(false)} />}
            {record && <RecordDrawer key={`${record.type}-${record.id}`} type={record.type} id={record.id} defaults={record.defaults} onClose={() => setRecord(null)} />}
            <div className="toasts" aria-live="polite">
              {toasts.map((t) => (
                <div key={t.id} className={`toast ${t.kind}`}>
                  <span className="selectable" style={{ overflowWrap: 'anywhere' }}>{t.text}</span>
                  {t.actions && <div className="row" style={{ marginTop: 8 }}>{t.actions.map((a) => <button key={a.label} className="btn btn-sm" onClick={a.run}>{a.label}</button>)}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </AppProvider>
    </BrowserRouter>
  );
}
