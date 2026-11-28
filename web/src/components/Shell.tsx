import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark, Icon } from './Icon';
import { useApp } from './AppContext';
import { NAV, isActive, navCode } from '../lib/nav';
import { setNotificationPrefs } from '../lib/timer';
import { decodeHeading } from '../lib/decode';
import { prepareAlarm } from '../lib/alarm';
import { applyTheme } from '../lib/themes';
import { TimerChip } from '../pages/TimerPage';
import { TimerAlerts } from './TimerAlerts';
import { api, onDataChanged } from '../lib/api';
import { initials, relTime, dueLabel } from '../lib/format';
import type { Notification, RecordRow } from '../lib/types';
import { Overlay } from './Overlay';
import { StatusBar } from './StatusBar';

function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

function Sidebar({ collapsed, mobileOpen, onToggle, onNavigate }: { collapsed: boolean; mobileOpen: boolean; onToggle: () => void; onNavigate: () => void }) {
  const { openCapture, openSearch } = useApp();
  const loc = useLocation();
  const [version, setVersion] = useState('');
  useEffect(() => { api.get<{ version: string }>('/meta').then((m) => setVersion(m.version)).catch(() => {}); }, []);
  // Keep the current entry visible in the sidebar (it scrolls when the window is short).
  useEffect(() => { document.querySelector('.sidebar .nav-item.active')?.scrollIntoView({ block: 'nearest' }); }, [loc.pathname, loc.search]);
  return (
    <nav className={`sidebar ${mobileOpen ? 'open' : ''}`} aria-label="Primary">
      <div className="sidebar-top">
        <Link to="/" className="brand" onClick={onNavigate} style={{ textDecoration: 'none' }} aria-label="SYNCHRONIA — Central Nexus">
          <BrandMark className="brand-mark" />
          <span className="brand-text">
            <div className="brand-word display">SYNCHRONIA</div>
            <div className="brand-sub">Academic Ascension System</div>
          </span>
        </Link>
        <button className="collapse-toggle hide-mobile" onClick={onToggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}>
          <Icon name={collapsed ? 'expand' : 'collapse'} size={16} />
        </button>
      </div>
      <button className="nav-search" onClick={() => { onNavigate(); openSearch(); }} aria-label="Search everything" title={collapsed ? 'Search everything (Ctrl K)' : undefined}>
        <Icon name="search" size={15} /><span className="txt">Search…</span><span className="kbd txt">Ctrl K</span>
      </button>
      <div className="nav">
        {NAV.map((g) => (
          <div key={g.label} className="nav-group" role="group" aria-label={g.label}>
            <div className="nav-section label">{g.label}</div>
            {g.items.map((it) => {
              const inner = (<><span className="code">{navCode[it.id]}</span><Icon name={it.icon} /><span className="txt">{it.label}</span></>);
              if (it.action === 'capture') {
                return <button key={it.id} type="button" className="nav-item" onClick={() => { onNavigate(); openCapture(); }} title={collapsed ? `${it.label} (C)` : undefined} aria-label={it.label}>{inner}</button>;
              }
              const active = isActive(it, loc.pathname, loc.search);
              return (
                <Link key={it.id} to={it.to} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}
                  onClick={onNavigate} title={collapsed ? it.label : undefined} aria-label={it.label}>{inner}</Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        <span className="txt">SYNCHRONIA{version ? ` v${version}` : ''}<br />Local database · offline</span>
      </div>
    </nav>
  );
}

function Notifications() {
  const { openRecord } = useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const ref = useClickAway(open, () => setOpen(false));
  useEffect(() => {
    const load = () => api.get<{ items: Notification[] }>('/notifications').then((d) => setItems(d.items)).catch(() => {});
    load();
    const off = onDataChanged(load);
    const t = setInterval(load, 60_000);
    return () => { off(); clearInterval(t); };
  }, []);
  const urgent = items.filter((i) => i.level !== 'info').length;
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" aria-label={`Notifications${items.length ? ` (${items.length})` : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" />
        {items.length > 0 && <span className="badge-dot" style={urgent ? undefined : { background: 'var(--violet)' }}>{items.length}</span>}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <div className="popover-head"><span className="label">Notifications</span><span className="faint" style={{ fontSize: 12 }}>Due within 3 days</span></div>
          <div className="popover-body">
            {items.length === 0 ? (
              <div className="empty"><strong>All clear.</strong>Nothing overdue or due in the next three days.</div>
            ) : (
              <ul className="list">
                {items.map((n) => (
                  <li key={n.id}>
                    <span className={`tag ${n.level === 'critical' ? 'red' : n.level === 'warning' ? 'orange' : 'violet'}`} style={{ width: 8, padding: 0, height: 8 }} aria-hidden />
                    <button className="rowlink" onClick={() => { setOpen(false); if (n.type === 'tasks') openRecord(n.type, n.entity_id); }}>
                      <span className="t">{n.title}</span>
                      <span className="s">{n.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { profileName } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useClickAway(open, () => setOpen(false));
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" style={{ width: 'auto', padding: 0 }} aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{initials(profileName, 'S')}</span>
      </button>
      {open && (
        <div className="popover" style={{ width: 260 }}>
          <div className="popover-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ color: 'var(--text)' }}>{profileName || 'Unnamed profile'}</span>
            <span className="faint" style={{ fontSize: 12 }}>Owner · this computer</span>
          </div>
          <ul className="menu" onClick={() => setOpen(false)}>
            <li><Link to="/portfolio/profile"><Icon name="user" />Professional profile</Link></li>
            <li><Link to="/portfolio"><Icon name="portfolio" />Professional portfolio</Link></li>
            <li><Link to="/settings"><Icon name="settings" />Settings</Link></li>
          </ul>
        </div>
      )}
    </div>
  );
}

function ContextPanel({ onClose }: { onClose: () => void }) {
  const { openRecord } = useApp();
  const [tasks, setTasks] = useState<RecordRow[] | null>(null);
  const [changes, setChanges] = useState<{ id: number; entity_type: string; entity_id: number; action: string; summary: string; at: string }[] | null>(null);
  useEffect(() => {
    const load = () => {
      api.get<{ items: RecordRow[] }>('/records/tasks?status=open&limit=8&sort=due_date&order=asc').then((d) => setTasks(d.items)).catch(() => setTasks([]));
      api.get<typeof changes>('/audit?limit=12').then(setChanges).catch(() => setChanges([]));
    };
    load();
    return onDataChanged(load);
  }, []);
  const sortedTasks = tasks ? [...tasks].sort((a, b) => (a.due_date ? 0 : 1) - (b.due_date ? 0 : 1) || String(a.due_date).localeCompare(String(b.due_date))) : null;
  return (
    <aside className="context" aria-label="Context panel">
      <div className="context-head">
        <span className="label">Context</span>
        <button className="icon-btn sm" onClick={onClose} aria-label="Close context panel"><Icon name="close" /></button>
      </div>
      <section>
        <h3 className="label">Pending tasks</h3>
        {sortedTasks === null ? <div className="skeleton" /> : sortedTasks.length === 0 ? (
          <div className="empty" style={{ padding: 0 }}>No open tasks.</div>
        ) : (
          <ul className="list">
            {sortedTasks.map((t) => (
              <li key={t.id}>
                <button className="rowlink" onClick={() => openRecord('tasks', t.id)}>
                  <span className="t">{t.title}</span>
                  <span className="s">{t.due_date ? dueLabel(t.due_date) : 'No due date'} · {t.module}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="label">Recent changes</h3>
        {changes === null ? <div className="skeleton" /> : changes.length === 0 ? (
          <div className="empty" style={{ padding: 0 }}>No activity yet.</div>
        ) : (
          <ul className="list">
            {changes.map((c) => (
              <li key={c.id} style={{ alignItems: 'flex-start' }}>
                <span className="grow">
                  <span className="s" style={{ whiteSpace: 'normal', color: 'var(--text-2)' }}>{c.summary}</span>
                  <span className="s num" style={{ fontSize: 11 }}>{relTime(c.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="label">Shortcuts</h3>
        <dl className="dl" style={{ gridTemplateColumns: '112px 1fr', fontSize: 13 }}>
          <dt><span className="kbd">/</span> <span className="kbd">Ctrl K</span></dt><dd>Global search</dd>
          <dt><span className="kbd">C</span></dt><dd>Quick Capture</dd>
          <dt><span className="kbd">?</span></dt><dd>This panel</dd>
          <dt><span className="kbd">Esc</span></dt><dd>Close dialog</dd>
          <dt><span className="kbd">Ctrl Enter</span></dt><dd>Save the open dialog</dd>
          <dt><span className="kbd">Ctrl S</span></dt><dd>Save the syllabus now</dd>
          <dt><span className="kbd">Ctrl C X V</span></dt><dd>Copy, cut, paste (text and pictures)</dd>
          <dt><span className="kbd">Ctrl A</span></dt><dd>Select all</dd>
          <dt><span className="kbd">Ctrl Z Y</span></dt><dd>Undo, redo</dd>
          <dt><span className="kbd">Ctrl B I U</span></dt><dd>Bold, italic, underline</dd>
          <dt><span className="kbd">Ctrl + − 0</span></dt><dd>Zoom in, out, reset</dd>
          <dt><span className="kbd">F11</span></dt><dd>Full screen window</dd>
          <dt><span className="kbd">Space F R</span></dt><dd>System Timer: start/pause, full screen, reset</dd>
          <dt><span className="kbd">Arrows Del</span></dt><dd>Moodboard: move, remove a card</dd>
        </dl>
      </section>
    </aside>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { prefs, updatePrefs, openCapture, openSearch } = useApp();
  const [mobileNav, setMobileNav] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const location = useLocation();
  const collapsed = !!prefs?.sidebar_collapsed;


  useEffect(() => { setMobileNav(false); }, [location.pathname]);
  // Every page or tab change starts at the top of the page.
  useEffect(() => { document.getElementById('main')?.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior }); }, [location.pathname, location.search]);
  // The system transition plays when moving to another area (Portfolio, Research, …), not between the sub-pages
  // or tabs of the same area.
  const section = location.pathname.split('/')[1] || 'nexus';
  const prevSection = useRef(section);
  const sameArea = prevSection.current === section;
  useEffect(() => { prevSection.current = section; }, [section]);
  // Each page's title decodes into place when the page opens (after lazy pages have rendered).
  useEffect(() => {
    let tries = 0; let t = 0;
    const run = () => { const h = document.querySelector<HTMLElement>('main .page-head h1, main h1.display'); if (h) decodeHeading(h); else if (++tries < 10) t = window.setTimeout(run, 60); };
    t = window.setTimeout(run, 30);
    return () => window.clearTimeout(t);
  }, [section]);
  // Deep links to a record pop-up: ?new=<type> opens a new record of that type, ?open=<type>:<id> an existing one.
  const navigateTo = useNavigate();
  const { openNew: deepNew, openRecord: deepOpen } = useApp();
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const n = q.get('new'); const o = q.get('open');
    if (!n && !o) return;
    if (n && /^[a-z_]+$/.test(n)) deepNew(n);
    const m = o && /^([a-z_]+):(\d+)$/.exec(o);
    if (m) deepOpen(m[1], Number(m[2]));
    q.delete('new'); q.delete('open');
    navigateTo({ pathname: location.pathname, search: q.toString() ? `?${q}` : '' }, { replace: true });
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  // Settings › Appearance: turn off non-essential motion.
  useEffect(() => { document.documentElement.dataset.motion = prefs?.reduce_motion ? 'reduced' : 'normal'; }, [prefs?.reduce_motion]);
  useEffect(() => { prepareAlarm(); }, []);
  useEffect(() => { if (prefs) setNotificationPrefs({ desktop: prefs.notify_desktop !== false, sound: prefs.notify_sound !== false, alarm: prefs.alarm_style || 'battle', volume: prefs.alarm_volume ?? 70 }); }, [prefs?.notify_desktop, prefs?.notify_sound, prefs?.alarm_style, prefs?.alarm_volume]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (prefs) applyTheme(prefs.theme); }, [prefs?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSearch(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.overlay')) return;
      if (e.key === '/') { e.preventDefault(); openSearch(); }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); openCapture(); }
      if (e.key === '?') { e.preventDefault(); setContextOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openCapture, openSearch]);

  // The context panel opens as a centred pop-up so pages keep the full window.
  const toggleContext = () => setContextOpen((o) => !o);

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a href="#main" className="sr-only">Skip to content</a>
      <Sidebar collapsed={collapsed} mobileOpen={mobileNav} onNavigate={() => setMobileNav(false)}
        onToggle={() => updatePrefs({ sidebar_collapsed: !collapsed }).catch(() => {})} />
      {mobileNav && <div className="sidebar-scrim show-mobile" onClick={() => setMobileNav(false)} />}
      <header className="topbar">
        <button className="icon-btn show-mobile" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Icon name="menu" /></button>
        <button className="icon-btn show-mobile" onClick={openSearch} aria-label="Global search"><Icon name="search" /></button>
        <span className="spacer" />
        <button className="btn btn-accent btn-sm hide-mobile" onClick={openCapture}><Icon name="plus" />Capture</button>
        <button className="icon-btn show-mobile" onClick={openCapture} aria-label="Quick Capture" style={{ color: 'var(--orange)' }}><Icon name="plus" /></button>
        <TimerChip />
        
        <Notifications />
        <button className="icon-btn hide-mobile" onClick={toggleContext} aria-label={contextOpen ? 'Hide context' : 'Show context: pending tasks and recent changes'} aria-pressed={contextOpen}>
          <Icon name="panel" />
        </button>
        <ProfileMenu />
      </header>
      <main className="main" id="main" tabIndex={-1} data-area-change={sameArea ? undefined : 'true'}><div key={section} className="route-sweep" aria-hidden />{children}</main>
      <StatusBar />
      <TimerAlerts />
      {contextOpen && (
        <Overlay onClose={() => setContextOpen(false)} label="Context">
          <div className="context-pop"><ContextPanel onClose={() => setContextOpen(false)} /></div>
        </Overlay>
      )}
    </div>
  );
}
