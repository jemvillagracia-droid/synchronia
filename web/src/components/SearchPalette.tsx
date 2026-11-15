import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Overlay } from './Overlay';
import { Icon } from './Icon';
import { api } from '../lib/api';
import { MODULES } from '../lib/modules';
import type { SearchResult } from '../lib/types';
import { useApp } from './AppContext';

/** Render FTS snippet markers [[…]] as <mark> without using innerHTML. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return <>{parts.map((p, i) => (p.startsWith('[[') ? <mark key={i}>{p.slice(2, -2)}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}

type Item = { kind: 'result'; r: SearchResult } | { kind: 'nav'; label: string; path: string; icon: string };

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { openRecord } = useApp();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api.get<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(term)}`)
        .then((d) => { setResults(d.results); setActive(0); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 140);
    return () => clearTimeout(t);
  }, [q]);

  const navItems: Item[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pages = [...MODULES.map((m) => ({ label: m.label, path: m.path, icon: m.icon })),
      { label: 'Professional Profile', path: '/portfolio/profile', icon: 'user' }, { label: 'Settings', path: '/settings', icon: 'settings' }];
    return pages.filter((p) => !term || p.label.toLowerCase().includes(term)).slice(0, term ? 3 : 9).map((p) => ({ kind: 'nav', ...p }));
  }, [q]);

  const items: Item[] = [...results.map((r) => ({ kind: 'result' as const, r })), ...navItems];

  function choose(it: Item) {
    onClose();
    if (it.kind === 'nav') navigate(it.path);
    else if (it.r.type === 'profile') navigate('/portfolio/profile');
    else if (it.r.type === 'moodboards') navigate(`/moodboard/${it.r.id}`);
    else openRecord(it.r.type, it.r.id);
  }

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => { (acc[r.label] ||= []).push(r); return acc; }, {});
  let idx = -1;

  return (
    <Overlay onClose={onClose} label="Global search">
      <div className="palette">
        <div className="palette-input">
          <Icon name="search" />
          <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every record — courses, publications, trainings, tasks…"
            aria-label="Search" role="combobox" aria-expanded="true" aria-controls="palette-list"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter' && items[active]) { e.preventDefault(); choose(items[active]); }
            }} />
          {loading && <span className="label">Scanning</span>}
        </div>
        <div className="palette-results" id="palette-list" role="listbox" ref={listRef}>
          {q.trim() && !loading && results.length === 0 && (
            <div className="palette-group empty"><strong>No records match “{q.trim()}”.</strong>Search covers every structured record you have saved.</div>
          )}
          {Object.entries(grouped).map(([label, rs]) => (
            <div key={label}>
              <div className="palette-group label">{label}</div>
              {rs.map((r) => {
                idx += 1;
                const i = idx;
                return (
                  <button key={`${r.type}-${r.id}`} className="palette-item" role="option" aria-selected={active === i}
                    onMouseEnter={() => setActive(i)} onClick={() => choose({ kind: 'result', r })}>
                    <span style={{ minWidth: 0 }}>
                      <span className="t"><Snippet text={r.title_highlighted || r.title} /></span>
                      {r.snippet && <span className="s"><Snippet text={r.snippet} /></span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {navItems.length > 0 && <div className="palette-group label">Go to</div>}
          {navItems.map((n) => {
            idx += 1;
            const i = idx;
            const it = n as Extract<Item, { kind: 'nav' }>;
            return (
              <button key={it.path} className="palette-item" role="option" aria-selected={active === i}
                onMouseEnter={() => setActive(i)} onClick={() => choose(it)}>
                <span style={{ width: 16, color: 'var(--text-3)' }}><Icon name={it.icon} size={16} /></span>
                <span className="t">{it.label}</span>
              </button>
            );
          })}
        </div>
        <div className="palette-foot"><span>↑↓ navigate</span><span>↵ open</span><span>Esc close</span></div>
      </div>
    </Overlay>
  );
}
