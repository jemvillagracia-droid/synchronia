// CV templates. Every template is single-column with real text, so it stays readable by parsers; the ATS template
// additionally drops rules, colour and photographs. "Harvard-inspired" follows the conventions of Harvard-style
// faculty CVs — it is not an official Harvard template.

export const FONT_STACKS = {
  'Times New Roman': "'Times New Roman', 'Liberation Serif', Tinos, Times, serif",
  Georgia: "Georgia, 'DejaVu Serif', 'Liberation Serif', serif",
  Garamond: "Garamond, 'EB Garamond', 'Liberation Serif', serif",
  Cambria: "Cambria, Caladea, 'Liberation Serif', serif",
  Calibri: "Calibri, Carlito, 'Liberation Sans', Arial, sans-serif",
  Arial: "Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif",
};

/**
 * name:      display name
 * font/size: defaults (overridable per CV)
 * align:     name block alignment
 * heading:   'smallcaps-rule' | 'caps-rule' | 'caps' | 'accent-rule'
 * dates:     'right' (dates right-aligned on the title line) | 'column' (left date column) | 'line' (own line, ATS)
 * accent:    heading colour (black for most)
 */
export const TEMPLATES = {
  harvard_academic: {
    name: 'Harvard-Inspired Academic CV', font: 'Times New Roman', size: 11, align: 'center', heading: 'caps-rule', dates: 'right', accent: '#000000',
    layout: 'harvard', separator: ' • ', nameSize: 1.65,
    description: 'Follows Harvard CV conventions: centered name and contact line, bold capital headings with a rule, organization and location on the first line, position or degree with dates on the second, action-verb bullets, Education first, no photograph.',
  },
  traditional_academic: {
    name: 'Traditional Academic CV', font: 'Garamond', size: 11.5, align: 'left', heading: 'caps', dates: 'column', accent: '#000000',
    description: 'Conservative serif layout with a date column, in the long-standing academic convention.',
  },
  modern_faculty: {
    name: 'Modern Academic CV', font: 'Calibri', size: 10.5, align: 'left', heading: 'accent-rule', dates: 'right', accent: '#2f3b63',
    description: 'Contemporary sans-serif layout with a restrained navy accent. Suited to faculty applications.',
  },
  research: {
    name: 'Research and Publication CV', font: 'Cambria', size: 11, align: 'center', heading: 'smallcaps-rule', dates: 'right', accent: '#000000', layout: 'harvard',
    description: 'Leads with research experience, publications and presentations.',
  },
  faculty_teaching: {
    name: 'Faculty and Teaching CV', font: 'Georgia', size: 10.5, align: 'left', heading: 'caps-rule', dates: 'right', accent: '#000000',
    description: 'Leads with education, appointments, courses handled and instructional development.',
  },
  comprehensive: {
    name: 'Comprehensive Professional CV', font: 'Times New Roman', size: 11, align: 'left', heading: 'caps-rule', dates: 'column', accent: '#000000',
    description: 'Academic, administrative, research and institutional experience in full, for employment and promotion files.',
  },
  minimal_ats: {
    name: 'Minimalist ATS CV', font: 'Arial', size: 11, align: 'left', heading: 'caps', dates: 'line', accent: '#000000', ats: true,
    description: 'Single column, conventional headings, no graphics. Built for applicant tracking systems.',
  },
};

export const PAGE_SIZES = {
  letter: { css: 'letter', width: 8.5, height: 11, label: 'Letter (8.5 × 11 in)' },
  a4: { css: 'A4', width: 8.27, height: 11.69, label: 'A4 (210 × 297 mm)' },
  folio: { css: '8.5in 13in', width: 8.5, height: 13, label: 'Folio / long bond (8.5 × 13 in)' },
};

export const SPACING = { compact: 0.7, normal: 1, relaxed: 1.35 };

export function styleFor(model) {
  const t = TEMPLATES[model.meta.template_key] || TEMPLATES.harvard_academic;
  const s = model.settings;
  return {
    ...t,
    font: s.font_family || t.font,
    size: s.font_size || t.size,
    spacing: SPACING[s.section_spacing] || 1,
    page: PAGE_SIZES[s.page_size] || PAGE_SIZES.letter,
    margins: s.margins,
  };
}
