import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { desktop } from '../lib/desktop';
import { insertPictures, localizePictures, portableSrc, rememberPictures, storePicture, LOCAL } from '../lib/docImages';
import { useApp } from './AppContext';

export type Page = { size: 'letter' | 'a4' | 'folio' | 'legal'; landscape: boolean };
/** Page sizes in inches (width × height, portrait). */
const INCHES: Record<Page['size'], [number, number]> = { letter: [8.5, 11], a4: [8.27, 11.69], folio: [8.5, 13], legal: [8.5, 14] };

/** Pictures: a width (percent of the line) and an alignment, kept through Word and PDF export. */
const Picture = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null, parseHTML: (el: HTMLElement) => { const m = /width:\s*(\d+)%/.exec(el.getAttribute('style') || ''); return m ? Number(m[1]) : null; },
        renderHTML: (a: { width?: number | null }) => (a.width ? { style: `width:${a.width}%` } : {}) },
      align: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute('data-align'), renderHTML: (a: { align?: string | null }) => (a.align ? { 'data-align': a.align } : {}) },
    };
  },
}).configure({ inline: false, allowBase64: true });

const imageFiles = (list?: FileList | null) => Array.from(list || []).filter((f) => f.type.startsWith('image/'));
const srcsIn = (doc: JSONContent | undefined, out: string[] = []) => { if (!doc) return out; if (doc.type === 'image' && doc.attrs?.src) out.push(doc.attrs.src); (doc.content || []).forEach((c) => srcsIn(c, out)); return out; };

/**
 * A word-processor document: one continuous page with headings, text formatting, alignment, lists, tables and
 * pictures. Cut, copy, paste (pictures included), drag-and-drop and select-all work by keyboard and from the toolbar.
 * The content is the editor's JSON, which the server renders to Word and PDF.
 */
export function DocEditor({ initial, onChange, page, label, editorRef }: {
  initial: JSONContent; onChange: (doc: JSONContent) => void; page: Page; label: string; editorRef?: (e: Editor | null) => void;
}) {
  const { toast } = useApp();
  const ed = useRef<Editor | null>(null);

  const report = (r: { stored: number; failed: number }) => {
    if (r.failed) toast(`${r.failed} picture${r.failed === 1 ? '' : 's'} could not be copied in (save ${r.failed === 1 ? 'it' : 'them'} to your computer and use Picture instead).`, 'error');
  };
  const upload = async (files: File[], pos?: number) => {
    const e = ed.current;
    if (!e || !files.length) return;
    const ok = [];
    for (const f of files) { try { ok.push(await storePicture(f, f.name)); } catch (err) { toast((err as Error).message, 'error'); } }
    if (ok.length && !e.isDestroyed) insertPictures(e, ok, pos);
  };
  // Copy/cut: other programs cannot open SYNCHRONIA's picture addresses, so the copied HTML carries the pictures.
  const copy = (view: EditorView, ev: ClipboardEvent, cut: boolean) => {
    const { from, to, empty } = view.state.selection;
    if (empty || !ev.clipboardData) return false;
    let pictures = false;
    view.state.doc.nodesBetween(from, to, (n) => { if (n.type.name === 'image') pictures = true; });
    if (!pictures) return false;
    const slice = view.state.selection.content();
    const box = document.createElement('div');
    box.appendChild(DOMSerializer.fromSchema(view.state.schema).serializeFragment(slice.content));
    box.querySelectorAll('img').forEach((img) => img.setAttribute('src', portableSrc(img.getAttribute('src') || '')));
    ev.clipboardData.clearData();
    ev.clipboardData.setData('text/html', box.innerHTML);
    ev.clipboardData.setData('text/plain', slice.content.textBetween(0, slice.content.size, '\n\n'));
    ev.preventDefault();
    if (cut) view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'));
    return true;
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, code: false, codeBlock: false, heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({ table: { resizable: true, cellMinWidth: 40 } }),
      Picture,
    ],
    content: initial,
    injectCSS: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'doc-content', 'aria-label': label, role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' },
      handlePaste: (_view, ev) => {
        const files = imageFiles(ev.clipboardData?.files);
        const html = ev.clipboardData?.getData('text/html') || '';
        const text = (ev.clipboardData?.getData('text/plain') || '').trim();
        // A copied picture (screenshot, image from a file or browser) arrives as a file: store and insert it.
        if (files.length && (!html || !text || /^<img|<img[^>]*>\s*$/i.test(html.replace(/<\/?(meta|html|body)[^>]*>|<!--[\s\S]*?-->/gi, '').trim()))) {
          ev.preventDefault(); void upload(files); return true;
        }
        // Formatted content with pictures (from Word or a web page): paste it, then store its pictures.
        if (/<img/i.test(html)) window.setTimeout(() => { if (ed.current) void localizePictures(ed.current).then(report); }, 0);
        return false;
      },
      handleDrop: (view, ev, _slice, moved) => {
        const files = imageFiles(ev.dataTransfer?.files);
        if (moved || !files.length) return false;
        ev.preventDefault();
        void upload(files, view.posAtCoords({ left: ev.clientX, top: ev.clientY })?.pos);
        return true;
      },
      handleDOMEvents: {
        copy: (view, ev) => copy(view, ev, false),
        cut: (view, ev) => copy(view, ev, true),
      },
    },
    onUpdate: ({ editor: e }) => { const json = e.getJSON(); rememberPictures(srcsIn(json)); onChange(json); },
  });
  useEffect(() => { ed.current = editor; editorRef?.(editor); return () => editorRef?.(null); }, [editor, editorRef]);
  useEffect(() => {
    rememberPictures(srcsIn(initial));
    // A document holding pictures from outside (e.g. saved before they were stored) gets them stored now.
    if (editor && srcsIn(initial).some((s) => !LOCAL.test(s))) void localizePictures(editor).then(report);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  const [w] = page.landscape ? [...INCHES[page.size]].reverse() : INCHES[page.size];
  return (
    <div className="doc-shell">
      {editor && <Toolbar editor={editor} upload={upload} />}
      <div className="doc-desk">
        <div className="doc-paper" style={{ maxWidth: `${w}in` }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function Btn({ on, active, disabled, label, children }: { on: () => void; active?: boolean; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button type="button" className={`tb ${active ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={on} disabled={disabled}
      aria-label={label} title={label} aria-pressed={active}>{children}</button>
  );
}

function Toolbar({ editor: e, upload }: { editor: Editor; upload: (files: File[]) => Promise<void> }) {
  const { toast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const c = () => e.chain().focus();
  const style = e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p';
  const inTable = e.isActive('table');
  const picture = e.isActive('image');
  const pic = picture ? e.getAttributes('image') : null;
  const align = (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) || 'left';
  const hasSel = !e.state.selection.empty;
  // Cut, copy and paste use the desktop app's own editing commands — exactly what Ctrl+X/C/V do, so pictures and
  // formatting travel the same way. Outside the desktop app the browser's commands are used (paste needs Ctrl+V).
  const native = (a: 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle') => {
    e.commands.focus();
    if (desktop?.edit) { void desktop.edit(a); return; }
    if ((a === 'cut' || a === 'copy') && document.execCommand(a)) return;
    toast(a === 'pasteAndMatchStyle' ? 'Press Ctrl+Shift+V to paste as plain text.' : 'Press Ctrl+V to paste.', 'info');
  };
  const setPic = (attrs: Record<string, unknown>) => c().updateAttributes('image', attrs).run();
  return (
    <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
      <div className="tb-group">
        <Btn label="Undo (Ctrl+Z)" on={() => c().undo().run()} disabled={!e.can().undo()}>↶</Btn>
        <Btn label="Redo (Ctrl+Y)" on={() => c().redo().run()} disabled={!e.can().redo()}>↷</Btn>
      </div>
      <div className="tb-group">
        <Btn label="Cut (Ctrl+X)" on={() => native('cut')} disabled={!hasSel}>Cut</Btn>
        <Btn label="Copy (Ctrl+C)" on={() => native('copy')} disabled={!hasSel}>Copy</Btn>
        <Btn label="Paste (Ctrl+V)" on={() => native('paste')}>Paste</Btn>
        <Btn label="Paste as plain text (Ctrl+Shift+V)" on={() => native('pasteAndMatchStyle')}>Paste text</Btn>
        <Btn label="Select all (Ctrl+A)" on={() => c().selectAll().run()}>Select all</Btn>
      </div>
      <div className="tb-group">
        <select className="tb-select" value={style} aria-label="Text style"
          onChange={(ev) => { const v = ev.target.value; if (v === 'p') c().setParagraph().run(); else c().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run(); }}>
          <option value="p">Normal text</option><option value="h1">Title</option><option value="h2">Heading</option><option value="h3">Subheading</option>
        </select>
      </div>
      <div className="tb-group">
        <Btn label="Bold (Ctrl+B)" active={e.isActive('bold')} on={() => c().toggleBold().run()}><b>B</b></Btn>
        <Btn label="Italic (Ctrl+I)" active={e.isActive('italic')} on={() => c().toggleItalic().run()}><i>I</i></Btn>
        <Btn label="Underline (Ctrl+U)" active={e.isActive('underline')} on={() => c().toggleUnderline().run()}><u>U</u></Btn>
        <Btn label="Strikethrough" active={e.isActive('strike')} on={() => c().toggleStrike().run()}><s>S</s></Btn>
      </div>
      <div className="tb-group">
        {(['left', 'center', 'right', 'justify'] as const).map((a) => (
          <Btn key={a} label={`Align ${a}`} active={!picture && align === a} on={() => (picture ? setPic({ align: a === 'left' || a === 'justify' ? null : a }) : c().setTextAlign(a).run())}><AlignIcon a={a} /></Btn>
        ))}
      </div>
      <div className="tb-group">
        <Btn label="Bulleted list" active={e.isActive('bulletList')} on={() => c().toggleBulletList().run()}>• ≡</Btn>
        <Btn label="Numbered list" active={e.isActive('orderedList')} on={() => c().toggleOrderedList().run()}>1. ≡</Btn>
        <Btn label="Horizontal line" on={() => c().setHorizontalRule().run()}>―</Btn>
      </div>
      <div className="tb-group">
        <input ref={file} type="file" hidden multiple accept="image/*" onChange={(ev) => { const fs = Array.from(ev.target.files || []); ev.target.value = ''; void upload(fs); }} />
        <Btn label="Insert picture (PNG, JPEG, GIF, WebP…)" on={() => file.current?.click()}>▣ Picture</Btn>
        {picture && (<>
          {[25, 50, 75, 100].map((w) => <Btn key={w} label={`Picture width ${w}%`} active={(pic?.width ?? 100) === w} on={() => setPic({ width: w })}>{w}%</Btn>)}
          <Btn label="Describe the picture (alternative text)" on={() => { const alt = window.prompt('Describe this picture (read aloud by screen readers and shown if it cannot be displayed):', pic?.alt || ''); if (alt !== null) setPic({ alt: alt.trim() || null }); }}>Alt text</Btn>
          <Btn label="Delete picture" on={() => c().deleteSelection().run()}>✕ Picture</Btn>
        </>)}
      </div>
      <div className="tb-group">
        <Btn label="Insert table" on={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞ Table</Btn>
        {inTable && (<>
          <Btn label="Add row below" on={() => c().addRowAfter().run()}>+ Row</Btn>
          <Btn label="Add column to the right" on={() => c().addColumnAfter().run()}>+ Col</Btn>
          <Btn label="Delete row" on={() => c().deleteRow().run()}>− Row</Btn>
          <Btn label="Delete column" on={() => c().deleteColumn().run()}>− Col</Btn>
          <Btn label="Merge selected cells" on={() => c().mergeCells().run()} disabled={!e.can().mergeCells()}>Merge</Btn>
          <Btn label="Split cell" on={() => c().splitCell().run()} disabled={!e.can().splitCell()}>Split</Btn>
          <Btn label="Header row on or off" on={() => c().toggleHeaderRow().run()}>Header</Btn>
          <Btn label="Delete table" on={() => c().deleteTable().run()}>✕ Table</Btn>
        </>)}
      </div>
      <div className="tb-group">
        <Btn label="Clear formatting" on={() => c().unsetAllMarks().clearNodes().run()}>Clear</Btn>
      </div>
    </div>
  );
}

function AlignIcon({ a }: { a: 'left' | 'center' | 'right' | 'justify' }) {
  const lines = { left: [16, 10, 14, 8], center: [16, 10, 14, 8], right: [16, 10, 14, 8], justify: [16, 16, 16, 16] }[a];
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden>
      {lines.map((w, i) => { const x = a === 'center' ? (16 - w) / 2 : a === 'right' ? 16 - w : 0; return <rect key={i} x={x} y={i * 3.6} width={w} height="1.6" fill="currentColor" />; })}
    </svg>
  );
}
