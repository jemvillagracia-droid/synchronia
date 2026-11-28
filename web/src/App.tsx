import { Suspense, lazy, useCallback, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter, Route, Routes, Link, Navigate } from 'react-router-dom';
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
import { AskTextHost } from './components/AskText';
import { desktop } from './lib/desktop';

// Pages load as separate chunks (the first screen opens sooner), and all of them are fetched once the app is idle,
// so moving between pages never waits on a download.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function page<K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}
const CalendarPage = page(() => import('./pages/CalendarPage'), 'CalendarPage');
const KnowledgePage = page(() => import('./pages/KnowledgePage'), 'KnowledgePage');
const TimelinePage = page(() => import('./pages/TimelinePage'), 'TimelinePage');
const IntelligencePage = page(() => import('./pages/IntelligencePage'), 'IntelligencePage');
const CredentialsPage = page(() => import('./pages/CredentialsPage'), 'CredentialsPage');
const ProfilePage = page(() => import('./pages/ProfilePage'), 'ProfilePage');
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage');
const CvStudio = page(() => import('./pages/cv/CvStudio'), 'CvStudio');
const CvEditor = page(() => import('./pages/cv/CvEditor'), 'CvEditor');
const AcademicPage = page(() => import('./pages/academic/AcademicPage'), 'AcademicPage');
const TimerPage = page(() => import('./pages/TimerPage'), 'TimerPage');
const SyllabusPage = page(() => import('./pages/academic/SyllabusPage'), 'SyllabusPage');
const ResearchPage = page(() => import('./pages/research/ResearchPage'), 'ResearchPage');
const ProjectPage = page(() => import('./pages/research/ProjectPage'), 'ProjectPage');
const InstrumentPage = page(() => import('./pages/research/InstrumentPage'), 'InstrumentPage');
const CoursePage = page(() => import('./pages/academic/CoursePage'), 'CoursePage');
const PortfolioOverview = page(() => import('./pages/PortfolioPage'), 'PortfolioOverview');
const PortfolioCategoryPage = page(() => import('./pages/PortfolioPage'), 'PortfolioCategoryPage');
const MoodboardList = page(() => import('./pages/MoodboardPage'), 'MoodboardList');
const MoodboardPage = page(() => import('./pages/MoodboardPage'), 'MoodboardPage');
const PRELOAD = [() => import('./pages/CalendarPage'), () => import('./pages/CredentialsPage'), () => import('./pages/IntelligencePage'), () => import('./pages/KnowledgePage'), () => import('./pages/MoodboardPage'), () => import('./pages/PortfolioPage'), () => import('./pages/ProfilePage'), () => import('./pages/SettingsPage'), () => import('./pages/TimelinePage'), () => import('./pages/TimerPage'), () => import('./pages/academic/AcademicPage'), () => import('./pages/academic/CoursePage'), () => import('./pages/academic/SyllabusPage'), () => import('./pages/cv/CvEditor'), () => import('./pages/cv/CvStudio'), () => import('./pages/research/InstrumentPage'), () => import('./pages/research/ProjectPage'), () => import('./pages/research/ResearchPage')];
function preloadPages() {
  const run = () => { for (const p of PRELOAD) void p().catch(() => {}); };
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2500 }); else window.setTimeout(run, 1200);
}
function PageLoading() {
  return <div className="page" aria-busy="true"><div className="skeleton" style={{ height: 28, width: 280, marginBottom: 16 }} /><div className="skeleton" style={{ height: 220 }} /></div>;
}

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
  useEffect(() => { if (auth?.user) preloadPages(); }, [auth?.user]);

  if (bootError) return <div className="page"><div className="alert">{bootError} Restart SYNCHRONIA.</div></div>;
  if (!auth) return <Boot />;
  if (!auth.user) return <Locked />;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider key={auth.user.id} user={auth.user}>
        {({ toasts, capture, setCapture, search, setSearch, record, setRecord }) => (
          <>
            <Shell>
              <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/" element={<NexusPage />} />
                <Route path="/portfolio" element={<PortfolioOverview />} />
                <Route path="/portfolio/profile" element={<ProfilePage />} />
                <Route path="/portfolio/timeline" element={<TimelinePage />} />
                <Route path="/credentials" element={<CredentialsPage />} />
                <Route path="/portfolio/credentials" element={<Navigate to="/credentials" replace />} />
                <Route path="/portfolio/:category" element={<PortfolioCategoryPage />} />
                <Route path="/academic" element={<AcademicPage />} />
                <Route path="/academic/courses/:id" element={<CoursePage />} />
                <Route path="/academic/syllabi/:id" element={<SyllabusPage />} />
                <Route path="/research" element={<ResearchPage />} />
                <Route path="/research/projects/:id" element={<ProjectPage />} />
                <Route path="/research/instruments/:id" element={<InstrumentPage />} />
                <Route path="/cv" element={<CvStudio />} />
                <Route path="/cv/:id" element={<CvEditor />} />
                <Route path="/intelligence" element={<IntelligencePage />} />
                <Route path="/knowledge" element={<KnowledgePage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/timer" element={<TimerPage />} />
                <Route path="/moodboard" element={<MoodboardList />} />
                <Route path="/moodboard/:id" element={<MoodboardPage />} />
                {MODULES.filter((m) => !['nexus', 'portfolio', 'cv', 'academic', 'intelligence', 'knowledge', 'research'].includes(m.id)).map((m) => <Route key={m.id} path={m.path} element={<ModulePage mod={m} />} />)}
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </Shell>
            {capture && <QuickCapture onClose={() => setCapture(false)} />}
            {search && <SearchPalette onClose={() => setSearch(false)} />}
            <AskTextHost />
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
