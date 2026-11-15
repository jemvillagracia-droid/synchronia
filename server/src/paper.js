// Paper sizes for every exported document. Word output uses the sizes in twips (1/1440 in); PDF output (printed by
// the desktop renderer from HTML) uses the CSS size. The owner's default lives in Settings › Document export.
export const PAPERS = {
  letter: { label: 'Short / Letter (8.5 × 11 in)', twips: [12240, 15840], css: '8.5in 11in' },
  folio:  { label: 'Long / Folio (8.5 × 13 in)', twips: [12240, 18720], css: '8.5in 13in' },
  a4:     { label: 'A4 (210 × 297 mm)', twips: [11906, 16838], css: '210mm 297mm' },
  legal:  { label: 'Legal (8.5 × 14 in)', twips: [12240, 20160], css: '8.5in 14in' },
  a5:     { label: 'A5 (148 × 210 mm)', twips: [8391, 11906], css: '148mm 210mm' },
  b5:     { label: 'B5 (182 × 257 mm)', twips: [10319, 14572], css: '182mm 257mm' },
};
let current = 'letter';
/** The owner's default paper (set from the saved preference when the app starts and whenever it changes). */
export const defaultPaper = () => current;
export function setDefaultPaper(size) { if (PAPERS[size]) current = size; }
/** CSS @page size. Two lengths may not be followed by portrait/landscape (browsers then drop the rule and print on
 *  Letter), so a landscape page swaps the lengths instead. */
export function pageSizeCss(css, landscape = false) {
  const parts = String(css).trim().split(/\s+/);
  if (parts.length === 2 && parts.every((x) => /^[\d.]+(in|mm|cm|pt|px)$/.test(x))) return landscape ? `${parts[1]} ${parts[0]}` : parts.join(' ');
  return `${css} ${landscape ? 'landscape' : 'portrait'}`;
}
export const paperCss = (size = current, landscape = false) => pageSizeCss((PAPERS[size] || PAPERS.letter).css, landscape);
/** Side margins shrink on small paper so tables keep a usable width. */
export const sideMargin = (size = current) => ((PAPERS[size] || PAPERS.letter).twips[0] < 11000 ? 1080 : 1440);
