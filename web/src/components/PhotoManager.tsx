import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { api, dataChanged, onDataChanged } from '../lib/api';
import { checkFile, cropToJpeg, makePreview, sendImage, ACCEPTED } from '../lib/images';
import { fmtBytes, type Photo } from '../lib/cv';
import { Overlay } from './Overlay';
import { Icon } from './Icon';
import { useApp } from './AppContext';

const ASPECTS = [
  { label: 'Portrait 4:5', value: 4 / 5 },
  { label: 'Passport 7:9', value: 7 / 9 },
  { label: 'Square 1:1', value: 1 },
  { label: '3:4', value: 3 / 4 },
];

/** Crop and reposition a photograph; produces the optimized JPEG used in CVs. The original is never modified. */
export function CropDialog({ photo, source, onClose, onSaved }: { photo: Photo; source: Blob | null; onClose: () => void; onSaved: (p: Photo) => void }) {
  const { toast } = useApp();
  const [blob, setBlob] = useState<Blob | null>(source);
  const [preview, setPreview] = useState<{ url: string; w: number; h: number } | null>(null);
  const [aspect, setAspect] = useState(ASPECTS[0].value);
  const [rect, setRect] = useState({ x: 0, y: 0, w: 0 });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const DISPLAY = 520;

  useEffect(() => {
    let url = '';
    (async () => {
      try {
        let b = blob;
        if (!b) {
          setBusy('Loading original…');
          const res = await fetch(`/api/images/${photo.id}/file?variant=original`);
          if (!res.ok) throw new Error('The original file could not be loaded.');
          b = await res.blob();
          setBlob(b);
        }
        setBusy('Preparing preview…');
        const p = await makePreview(b, { width: photo.width, height: photo.height });
        url = URL.createObjectURL(p.blob);
        setPreview({ url, w: p.previewWidth, h: p.previewHeight });
        setBusy('');
      } catch (e) { setError((e as Error).message); setBusy(''); }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scale = preview ? Math.min(DISPLAY / preview.w, 420 / preview.h, 1.5) : 1;
  const dw = preview ? preview.w * scale : 0;
  const dh = preview ? preview.h * scale : 0;

  const clamp = useCallback((r: { x: number; y: number; w: number }) => {
    let w = Math.min(r.w, dw, dh * aspect);
    w = Math.max(w, 40);
    const h = w / aspect;
    return { w, x: Math.min(Math.max(0, r.x), dw - w), y: Math.min(Math.max(0, r.y), dh - h) };
  }, [dw, dh, aspect]);

  // Initial / aspect change: largest centered crop
  useEffect(() => {
    if (!preview) return;
    const w = Math.min(dw, dh * aspect) * 0.9;
    setRect(clamp({ w, x: (dw - w) / 2, y: (dh - w / aspect) / 2 }));
  }, [preview, aspect]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (e: RPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y };
  };
  const onMove = (e: RPointerEvent) => { if (drag.current) setRect((r) => clamp({ ...r, x: e.clientX - drag.current!.dx, y: e.clientY - drag.current!.dy })); };
  const onUp = () => { drag.current = null; };
  const nudge = (dx: number, dy: number) => setRect((r) => clamp({ ...r, x: r.x + dx, y: r.y + dy }));

  async function save() {
    if (!blob || !preview) return;
    setBusy('Optimizing…'); setError('');
    try {
      const k = photo.width / dw; // display → original pixels
      const crop = { x: rect.x * k, y: rect.y * k, width: rect.w * k, height: (rect.w / aspect) * k };
      const out = await cropToJpeg(blob, crop, 1000, 0.88);
      const saved = await sendImage(`/api/images/${photo.id}/optimized`, out.blob, 'image/jpeg', { 'X-Crop': JSON.stringify({ ...crop, aspect }) }, undefined, 'PUT');
      toast('Photograph cropped and optimized', 'ok');
      dataChanged();
      onSaved(saved);
    } catch (e) { setError((e as Error).message); setBusy(''); }
  }

  return (
    <Overlay onClose={onClose} label="Crop photograph">
      <div className="modal" style={{ width: 'min(640px, calc(100vw - 32px))' }}>
        <div className="modal-head"><h2>Crop and reposition</h2><button className="icon-btn sm" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <div className="modal-body">
          <div className="seg" role="group" aria-label="Aspect ratio">
            {ASPECTS.map((a) => <button key={a.label} aria-pressed={aspect === a.value} onClick={() => setAspect(a.value)}>{a.label}</button>)}
          </div>
          {error && <div className="alert">{error}</div>}
          <div className="crop-stage" style={{ height: dh || 300 }}>
            {preview ? (
              <div ref={box} className="crop-box" style={{ width: dw, height: dh, backgroundImage: `url(${preview.url})` }}>
                <div className="crop-rect" role="slider" tabIndex={0} aria-label="Crop area — drag or use arrow keys"
                  aria-valuetext={`${Math.round(rect.x)}, ${Math.round(rect.y)}`}
                  style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.w / aspect }}
                  onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
                  onKeyDown={(e) => { const d = e.shiftKey ? 10 : 2; if (e.key === 'ArrowLeft') nudge(-d, 0); if (e.key === 'ArrowRight') nudge(d, 0); if (e.key === 'ArrowUp') nudge(0, -d); if (e.key === 'ArrowDown') nudge(0, d); }} />
              </div>
            ) : <div className="empty">{busy || 'Loading…'}</div>}
          </div>
          {preview && (
            <label className="field">
              <span className="label">Crop size</span>
              <input type="range" min={40} max={Math.floor(Math.min(dw, dh * aspect))} value={Math.round(rect.w)}
                onChange={(e) => { const w = Number(e.target.value); setRect((r) => clamp({ w, x: r.x + (r.w - w) / 2, y: r.y + (r.w - w) / aspect / 2 })); }} />
            </label>
          )}
          <p className="faint" style={{ fontSize: 12, margin: 0 }}>
            The original ({photo.width}×{photo.height}, {fmtBytes(photo.size_bytes)}) is kept unchanged. CVs use an optimized copy of the cropped area (up to 1000 px).
          </p>
        </div>
        <div className="modal-foot">
          <span className="faint" style={{ fontSize: 12 }}>{busy}</span>
          <div className="row">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!preview || !!busy}><Icon name="check" />Save crop</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

/** Photograph library: upload (≤100 MB, JPEG/PNG/WebP), crop, label, set as profile photo, replace, remove; optional selection. */
export function PhotoManager({ selectedId, onSelect, disabled }: { selectedId?: number | null; onSelect?: (id: number | null) => void; disabled?: boolean }) {
  const { toast } = useApp();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<{ name: string; f: number } | null>(null);
  const [error, setError] = useState('');
  const [crop, setCrop] = useState<{ photo: Photo; source: Blob | null } | null>(null);
  const [stamp, setStamp] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<number | null>(null);

  const load = useCallback(() => { api.get<Photo[]>('/images').then(setPhotos).catch(() => setPhotos([])); setStamp(Date.now()); }, []);
  useEffect(() => { load(); return onDataChanged(load); }, [load]);

  async function upload(file: File) {
    setError('');
    const problem = checkFile(file);
    if (problem) { setError(problem); return; }
    setProgress({ name: file.name, f: 0 });
    try {
      const q = replaceTarget.current ? `?replaces=${replaceTarget.current}` : '';
      const photo = await sendImage(`/api/images${q}`, file, file.type, { 'X-Filename': encodeURIComponent(file.name) }, (f) => setProgress({ name: file.name, f }));
      replaceTarget.current = null;
      setProgress(null);
      toast(`Uploaded ${file.name}`, 'ok');
      load();
      setCrop({ photo, source: file });
    } catch (e) {
      setProgress(null);
      setError((e as Error).message);
    }
  }

  async function act(p: Photo, body: Record<string, unknown>, msg: string) {
    try { await api.patch(`/images/${p.id}`, body); toast(msg, 'ok'); load(); dataChanged(); } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function remove(p: Photo) {
    try { await api.del(`/images/${p.id}`); toast('Photograph removed', 'ok'); if (selectedId === p.id) onSelect?.(null); load(); dataChanged(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="stack">
      <div className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}>
        <Icon name="user" size={22} />
        <div>
          <strong>Drop a professional photograph here</strong>
          <div className="faint" style={{ fontSize: 12 }}>JPEG, PNG or WebP · up to 100 MB · the original is preserved</div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => { replaceTarget.current = null; input.current?.click(); }}>Choose file…</button>
        <input ref={input} type="file" accept={ACCEPTED.join(',')} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
      </div>
      {progress && (
        <div>
          <div className="between" style={{ fontSize: 12 }}><span className="muted">Uploading {progress.name}</span><span className="num">{Math.round(progress.f * 100)}%</span></div>
          <div className="meter mt-2"><span style={{ width: `${progress.f * 100}%` }} /></div>
        </div>
      )}
      {error && <div className="alert" role="alert">{error}</div>}
      {photos && photos.length > 0 && (
        <div className="photo-grid">
          {onSelect && (
            <button type="button" className={`photo-card none ${selectedId == null ? 'selected' : ''}`} onClick={() => onSelect(null)} disabled={disabled} aria-pressed={selectedId == null}>
              <span className="photo-thumb"><Icon name="close" size={22} /></span>
              <span className="photo-meta"><span className="t">No photograph</span><span className="s">Text-only CV</span></span>
            </button>
          )}
          {photos.map((p) => (
            <div key={p.id} className={`photo-card ${selectedId === p.id ? 'selected' : ''}`}>
              <button type="button" className="photo-thumb" onClick={() => (onSelect ? (p.has_optimized ? onSelect(p.id) : setCrop({ photo: p, source: null })) : setCrop({ photo: p, source: null }))}
                disabled={disabled} aria-label={onSelect ? `Use ${p.label}` : `Crop ${p.label}`} aria-pressed={onSelect ? selectedId === p.id : undefined}>
                {p.has_optimized ? <img src={`/api/images/${p.id}/file?v=${stamp}`} alt={p.label} /> : <span className="faint" style={{ fontSize: 11 }}>Crop needed</span>}
              </button>
              <div className="photo-meta">
                <span className="t" title={p.original_name}>{p.label}</span>
                <span className="s">{p.width}×{p.height} · {fmtBytes(p.size_bytes)}</span>
                <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                  {p.is_profile_photo && <span className="tag violet">Profile</span>}
                  {p.used_by.length > 0 && <span className="tag">{p.used_by.length} CV{p.used_by.length > 1 ? 's' : ''}</span>}
                </div>
                <div className="row wrap" style={{ gap: 2, marginTop: 4 }}>
                  <button className="linkbtn" style={{ margin: 0 }} onClick={() => setCrop({ photo: p, source: null })}>Crop</button>
                  {!p.is_profile_photo && <button className="linkbtn" onClick={() => act(p, { is_profile_photo: true }, 'Set as profile photograph')}>Profile</button>}
                  <button className="linkbtn" onClick={() => { replaceTarget.current = p.id; input.current?.click(); }}>Replace</button>
                  <button className="linkbtn" onClick={() => remove(p)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {crop && <CropDialog photo={crop.photo} source={crop.source} onClose={() => setCrop(null)}
        onSaved={(p) => { setCrop(null); load(); if (onSelect) onSelect(p.id); }} />}
    </div>
  );
}
