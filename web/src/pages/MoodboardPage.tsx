import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, dataChanged } from '../lib/api';
import { relTime } from '../lib/format';
import { storePicture } from '../lib/docImages';
import { useApp } from '../components/AppContext';
import { Icon } from '../components/Icon';
import { askText } from '../components/AskText';

interface Item { id: number; kind: 'note' | 'image' | 'link'; x: number; y: number; w: number; h: number; z: number; color: string | null; text: string | null; image_src: string | null; url: string | null }
interface Board { id: number; title: string; context_type: string; context_id: number | null; items?: number; updated_at: string }
const COLORS = ['violet', 'yellow', 'pink', 'green', 'blue', 'orange', 'grey'];
const CONTEXT: Record<string, string> = { general: 'General', research_projects: 'Research project', courses: 'Course', syllabi: 'Syllabus' };

/** All boards: one per place of work, plus the general board. */
export function MoodboardList() {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[] | null>(null);
  useEffect(() => { api.get<Board[]>('/moodboards').then(setBoards).catch(() => setBoards([])); }, []);
  return (
    <div className="page">
      <div className="page-head"><div>
        <div className="crumb"><span className="bar" /><span className="label">Command Center · Idea Moodboard</span></div>
        <h1 className="display">Idea Moodboard</h1>
        <div className="sub">An endless board of notes, pictures and links for each place you work. Quick Capture › Moodboard pins ideas to the board of the page you are on.</div>
      </div>
        <div className="actions"><button className="btn btn-primary" onClick={async () => { const d = await api.get<{ board: Board }>('/moodboards/for?type=general'); navigate(`/moodboard/${d.board.id}`); }}><Icon name="bolt" />Open the general board</button></div>
      </div>
      {!boards ? <div className="skeleton" style={{ height: 160 }} /> : boards.length === 0 ? <div className="empty">No boards yet. Open the general board, or use Quick Capture › Moodboard on a research project or course.</div> : (
        <div className="res-grid">{boards.map((b) => (
          <Link key={b.id} className="res-card" to={`/moodboard/${b.id}`}><span className="res-stage">{CONTEXT[b.context_type] || b.context_type}</span><span className="t">{b.title}</span>
            <span className="faint" style={{ fontSize: 12.5 }}>{b.items} card{b.items === 1 ? '' : 's'} · updated {relTime(b.updated_at)}</span></Link>
        ))}</div>
      )}
    </div>
  );
}

/** One board: pan and zoom without limits; cards can be added, moved, resized, coloured and removed. */
export function MoodboardPage() {
  const { id } = useParams();
  const { toast } = useApp();
  const [board, setBoard] = useState<Board | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [view, setView] = useState(() => { try { return JSON.parse(localStorage.getItem(`moodboard-view-${id}`) || '') as { x: number; y: number; s: number }; } catch { return { x: 40, y: 40, s: 1 }; } });
  const stage = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const drag = useRef<{ mode: 'pan' | 'move' | 'size'; id?: number; sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => { api.get<{ board: Board; items: Item[] }>(`/moodboards/${id}`).then((d) => { setBoard(d.board); setItems(d.items); }).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { try { localStorage.setItem(`moodboard-view-${id}`, JSON.stringify(view)); } catch { /* ignore */ } }, [view, id]);

  const toBoard = (cx: number, cy: number) => { const r = stage.current!.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s }; };
  const center = () => { const r = stage.current!.getBoundingClientRect(); return toBoard(r.left + r.width / 2 - 120, r.top + r.height / 2 - 80); };
  const patch = useCallback(async (it: Item, v: Partial<Item>) => {
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, ...v } : x)));
    try { await api.patch(`/moodboards/items/${it.id}`, v); } catch (e) { toast((e as Error).message, 'error'); }
  }, [toast]);
  async function add(v: Partial<Item> & { kind: Item['kind'] }) {
    try { const it = await api.post<Item>(`/moodboards/${id}/items`, { w: 240, h: v.kind === 'image' ? 200 : 160, color: v.kind === 'note' ? 'violet' : null, ...v }); setItems((xs) => [...xs, it]); setSel(it.id); dataChanged(); return it; }
    catch (e) { toast((e as Error).message, 'error'); return null; }
  }
  async function addPictures(files: File[], at?: { x: number; y: number }) {
    let p = at || center();
    for (const f of files.filter((x) => x.type.startsWith('image/'))) {
      try { const s = await storePicture(f, f.name); const w = Math.min(360, s.width || 280); const h = s.width && s.height ? Math.round((w * s.height) / s.width) : 220; await add({ kind: 'image', image_src: s.src, x: p.x, y: p.y, w, h }); p = { x: p.x + 30, y: p.y + 30 }; }
      catch (e) { toast((e as Error).message, 'error'); }
    }
  }
  async function remove(it: Item) {
    setItems((xs) => xs.filter((x) => x.id !== it.id)); setSel(null);
    try {
      await api.del(`/moodboards/items/${it.id}`); dataChanged();
      toast('Card removed', 'ok', [{ label: 'Undo', run: () => { void add({ kind: it.kind, x: it.x, y: it.y, w: it.w, h: it.h, color: it.color, text: it.text, image_src: it.image_src, url: it.url }); } }]);
    } catch (e) { toast((e as Error).message, 'error'); }
  }
  const zoom = (f: number, cx?: number, cy?: number) => setView((v) => {
    const s = Math.max(0.15, Math.min(3, v.s * f));
    const r = stage.current!.getBoundingClientRect(); const px = (cx ?? r.left + r.width / 2) - r.left; const py = (cy ?? r.top + r.height / 2) - r.top;
    return { s, x: px - ((px - v.x) * s) / v.s, y: py - ((py - v.y) * s) / v.s };
  });
  const fit = () => {
    if (!items.length) { setView({ x: 40, y: 40, s: 1 }); return; }
    const r = stage.current!.getBoundingClientRect();
    const minX = Math.min(...items.map((i) => i.x)); const minY = Math.min(...items.map((i) => i.y));
    const maxX = Math.max(...items.map((i) => i.x + i.w)); const maxY = Math.max(...items.map((i) => i.y + i.h));
    const s = Math.max(0.15, Math.min(1.5, Math.min((r.width - 80) / (maxX - minX || 1), (r.height - 80) / (maxY - minY || 1))));
    setView({ s, x: 40 - minX * s + (r.width - 80 - (maxX - minX) * s) / 2, y: 40 - minY * s });
  };

  // Paste on the board (outside a note being edited): pictures, links and text become cards.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (!stage.current?.contains(t) && t !== document.body) return;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'));
      const text = (e.clipboardData?.getData('text/plain') || '').trim();
      if (files.length) { e.preventDefault(); void addPictures(files); return; }
      if (!text) return;
      e.preventDefault();
      const c = center();
      if (/^https?:\/\/\S+$/i.test(text)) void add({ kind: 'link', url: text, text: null, ...c }); else void add({ kind: 'note', text, ...c });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });
  // Keyboard: arrows move the selected card, Delete removes it, Escape leaves a card's text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Escape' && t.tagName === 'TEXTAREA' && t.closest('.mb-card')) { (t as HTMLTextAreaElement).blur(); stage.current?.focus({ preventScroll: true }); return; }
      if (sel == null || t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || document.querySelector('.overlay')) return;
      const it = items.find((x) => x.id === sel); if (!it) return;
      const d = e.shiftKey ? 50 : 10;
      const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (mv) { e.preventDefault(); void patch(it, { x: it.x + mv[0], y: it.y + mv[1] }); }
      if (e.key === 'Delete') { e.preventDefault(); void remove(it); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function down(e: React.PointerEvent, mode: 'pan' | 'move' | 'size', it?: Item) {
    if (e.button !== 0) return;
    if (mode !== 'pan') e.stopPropagation();
    if (mode === 'pan' && (e.target as HTMLElement).closest('.mb-card')) return;
    // Leave any card text box, so arrow keys and Delete act on the card itself.
    if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
    stage.current?.focus({ preventScroll: true });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, id: it?.id, sx: e.clientX, sy: e.clientY, ox: mode === 'pan' ? view.x : mode === 'move' ? it!.x : it!.w, oy: mode === 'pan' ? view.y : mode === 'move' ? it!.y : it!.h };
    if (it) { setSel(it.id); const top = Math.max(0, ...items.map((x) => x.z)); if (it.z < top) void patch(it, { z: top + 1 }); }
    else setSel(null);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.sx; const dy = e.clientY - d.sy;
    if (d.mode === 'pan') setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else setItems((xs) => xs.map((x) => (x.id !== d.id ? x : d.mode === 'move' ? { ...x, x: d.ox + dx / view.s, y: d.oy + dy / view.s } : { ...x, w: Math.max(80, d.ox + dx / view.s), h: Math.max(50, d.oy + dy / view.s) })));
  }
  function up() {
    const d = drag.current; drag.current = null;
    if (!d || d.mode === 'pan') return;
    const it = items.find((x) => x.id === d.id); if (!it) return;
    void patch(it, d.mode === 'move' ? { x: Math.round(it.x), y: Math.round(it.y) } : { w: Math.round(it.w), h: Math.round(it.h) });
  }

  if (error) return <div className="page"><div className="alert">{error}</div><Link to="/moodboard" className="btn mt-4">All boards</Link></div>;
  if (!board) return <div className="page"><div className="skeleton" style={{ height: 400 }} /></div>;
  const selected = items.find((x) => x.id === sel) || null;
  return (
    <div className="page mb-page">
      <div className="mb-head">
        <div><div className="crumb"><span className="bar" /><span className="label"><Link to="/moodboard">Idea Moodboard</Link> · {CONTEXT[board.context_type]}</span></div><h1 className="mb-title">{board.title}</h1></div>
        <div className="mb-tools" role="toolbar" aria-label="Moodboard">
          <button className="btn btn-sm btn-primary" onClick={() => add({ kind: 'note', text: '', ...center() })}><Icon name="plus" />Note</button>
          <input ref={file} type="file" hidden multiple accept="image/*" onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; void addPictures(fs); }} />
          <button className="btn btn-sm" onClick={() => file.current?.click()}><Icon name="upload" />Picture</button>
          <button className="btn btn-sm" onClick={async () => { const u = await askText('Link address', 'https://'); if (u && /^https?:\/\/\S+/.test(u)) void add({ kind: 'link', url: u, ...center() }); }}><Icon name="link" />Link</button>
          <span className="tmr-sep" />
          <button className="icon-btn sm" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">−</button>
          <span className="mb-zoom num">{Math.round(view.s * 100)}%</span>
          <button className="icon-btn sm" onClick={() => zoom(1.2)} aria-label="Zoom in">+</button>
          <button className="btn btn-sm" onClick={fit}>Fit</button>
          {selected && (<>
            <span className="tmr-sep" />
            {selected.kind === 'note' && <div className="mb-colors" role="radiogroup" aria-label="Card colour">{COLORS.map((c) => (
              <button key={c} role="radio" aria-checked={selected.color === c} aria-label={c} className={`mb-sw mb-c-${c} ${selected.color === c ? 'on' : ''}`} onClick={() => patch(selected, { color: c })} />))}</div>}
            <button className="btn btn-sm btn-ghost" onClick={() => remove(selected)}><Icon name="trash" />Remove</button>
          </>)}
        </div>
      </div>
      <div ref={stage} className="mb-stage" tabIndex={0} aria-label={`Moodboard ${board.title}. Double-click to add a note; paste pictures or links.`}
        style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${28 * view.s}px ${28 * view.s}px` }}
        onPointerDown={(e) => down(e, 'pan')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); } else setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) })); }}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('.mb-card')) { const p = toBoard(e.clientX, e.clientY); void add({ kind: 'note', text: '', x: p.x - 20, y: p.y - 20 }); } }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { const fs = Array.from(e.dataTransfer.files || []); if (fs.length) { e.preventDefault(); void addPictures(fs, toBoard(e.clientX, e.clientY)); } }}>
        <div className="mb-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
          {items.map((it) => (
            <div key={it.id} className={`mb-card k-${it.kind} mb-c-${it.color || 'none'} ${sel === it.id ? 'sel' : ''}`} style={{ left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.z }}
              onPointerDown={(e) => { if ((e.target as HTMLElement).closest('textarea, a, button')) { setSel(it.id); return; } down(e, 'move', it); }}>
              <div className="mb-grip" title="Drag to move">
                <button type="button" className="mb-x" aria-label="Remove card" onClick={() => void remove(it)}>×</button>
              </div>
              {it.kind === 'note' && <textarea className="mb-text" defaultValue={it.text || ''} placeholder="Write an idea…" aria-label="Idea"
                onFocus={() => setSel(it.id)} onBlur={(e) => { if (e.target.value !== (it.text || '')) void patch(it, { text: e.target.value }); }} autoFocus={!it.text && sel === it.id} />}
              {it.kind === 'image' && it.image_src && <img src={it.image_src} alt={it.text || 'Picture'} draggable={false} />}
              {it.kind === 'link' && it.url && <div className="mb-link"><Icon name="link" /><a href={it.url} target="_blank" rel="noreferrer noopener">{it.url}</a>
                <textarea className="mb-text small" defaultValue={it.text || ''} placeholder="Why it matters…" aria-label="Note about the link" onBlur={(e) => { if (e.target.value !== (it.text || '')) void patch(it, { text: e.target.value }); }} /></div>}
              <span className="mb-size" onPointerDown={(e) => down(e, 'size', it)} aria-hidden />
            </div>
          ))}
        </div>
        {items.length === 0 && <div className="mb-empty">Double-click anywhere to write an idea. Paste or drop pictures and links. Drag the background to move; Ctrl + scroll to zoom.</div>}
      </div>
    </div>
  );
}
