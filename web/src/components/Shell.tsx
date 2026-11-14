import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BrandMark, Icon } from './Icon';
import { useApp } from './AppContext';
import { NAV, isActive, navCode } from '../lib/nav';
import { api, onDataChanged, dataChanged } from '../lib/api';
import { MODE_LABEL, MODE_DESC, initials, relTime, dueLabel } from '../lib/format';
import type { Mode, Notification, RecordRow } from '../lib/types';
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
                    <button className="rowlink" onClick={() => { setOpen(false); if (n.type === 'tasks' || n.type === 'correspondence') openRecord(n.type, n.entity_id); }}>
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

function ModeSwitch() {
  const { prefs, updatePrefs, toast } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useClickAway(open, () => setOpen(false));
  if (!prefs) return null;
  async function pick(m: Mode) {
    setOpen(false);
    if (m === prefs!.academic_mode) return;
    await updatePrefs({ academic_mode: m });
    dataChanged();
    toast(`Academic mode: ${MODE_LABEL[m]}`, 'ok');
  }
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="mode-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Academic mode: ${MODE_LABEL[prefs.academic_mode]}. Change mode`}>
        <span className="dot" aria-hidden />
        <span className="txt">{MODE_LABEL[prefs.academic_mode]}</span>
        <Icon name="down" size={12} />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Academic mode" style={{ width: 340 }}>
          <div className="popover-head"><span className="label">Current academic mode</span></div>
          <ul className="menu">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <li key={m}>
                <button onClick={() => pick(m)} aria-pressed={m === prefs.academic_mode} style={{ alignItems: 'flex-start' }}>
                  <span style={{ width: 16, paddingTop: 2, color: 'var(--orange)' }}>{m === prefs.academic_mode ? <Icon name="check" /> : null}</span>
                  <span>
                    <span style={{ display: 'block', color: 'var(--text)' }}>{MODE_LABEL[m]}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'normal' }}>{MODE_DESC[m]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
        <dl className="dl" style={{ gridTemplateColumns: '90px 1fr', fontSize: 13 }}>
          <dt><span className="kbd">/</span> <span className="kbd">Ctrl K</span></dt><dd>Global search</dd>
          <dt><span className="kbd">C</span></dt><dd>Quick Capture</dd>
          <dt><span className="kbd">Esc</span></dt><dd>Close dialog</dd>
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
  // Settings › Appearance: turn off non-essential motion.
  useEffect(() => { document.documentElement.dataset.motion = prefs?.reduce_motion ? 'reduced' : 'normal'; }, [prefs?.reduce_motion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSearch(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.overlay')) return;
      if (e.key === '/') { e.preventDefault(); openSearch(); }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); openCapture(); }
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
        <ModeSwitch />
        <Notifications />
        <button className="icon-btn hide-mobile" onClick={toggleContext} aria-label={contextOpen ? 'Hide context' : 'Show context: pending tasks and recent changes'} aria-pressed={contextOpen}>
          <Icon name="panel" />
        </button>
        <ProfileMenu />
      </header>
      <main className="main" id="main" tabIndex={-1}>{children}</main>
      <StatusBar />
      {contextOpen && (
        <Overlay onClose={() => setContextOpen(false)} label="Context">
          <div className="context-pop"><ContextPanel onClose={() => setContextOpen(false)} /></div>
        </Overlay>
      )}
    </div>
  );
}
