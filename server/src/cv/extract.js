// Reads back the text a document parser would retrieve from the generated files — the basis of the
// "extracted text" preview and the ATS analyzer. Nothing here looks at the CV model; it only reads the files.
import JSZip from 'jszip';

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function paragraphsOf(xml) {
  const out = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || []) {
    const isList = /<w:numPr>/.test(p);
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] || null;
    let text = '';
    for (const tok of p.match(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\/>|<w:fldSimple[^>]*w:instr="([^"]*)"/g) || []) {
      if (tok === '<w:tab/>') text += '\t';
      else if (tok === '<w:br/>') text += '\n';
      else if (tok.startsWith('<w:fldSimple')) text += '#';
      else text += decode(tok.replace(/<[^>]+>/g, ''));
    }
    out.push({ style, list: isList, text });
  }
  return out;
}

export async function docxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const doc = await zip.file('word/document.xml')?.async('string');
  if (!doc) throw new Error('Not a Word document');
  const paragraphs = paragraphsOf(doc);
  const footers = [];
  for (const name of Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n))) {
    footers.push(...paragraphsOf(await zip.file(name).async('string')).map((p) => p.text).filter(Boolean));
  }
  const headings = paragraphs.filter((p) => p.style === 'Heading1').map((p) => p.text.trim());
  const text = paragraphs.filter((p) => p.text.trim()).map((p) => `${p.list ? '• ' : ''}${p.text.replace(/\t/g, ' — ')}`).join('\n');
  const media = Object.keys(zip.files).filter((n) => n.startsWith('word/media/'));
  return { text, headings, footers, images: media.length, paragraphs: paragraphs.length };
}

let pdfjsPromise;
const loadPdfjs = () => (pdfjsPromise ||= import('pdfjs-dist/legacy/build/pdf.mjs'));

export async function pdfText(buffer) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    const lines = [];
    let lastY = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2 && line.trim()) { lines.push(line.trimEnd()); line = ''; }
      line += item.str;
      if (item.hasEOL) { lines.push(line.trimEnd()); line = ''; lastY = null; continue; }
      lastY = y;
    }
    if (line.trim()) lines.push(line.trimEnd());
    pages.push(lines.filter((l) => l.trim()).join('\n'));
  }
  const info = await doc.getMetadata().catch(() => null);
  await doc.destroy();
  return { text: pages.join('\n\f\n'), pages: pages.length, title: info?.info?.Title || null };
}
