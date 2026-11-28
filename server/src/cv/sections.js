// CV section catalogue: where each section's entries come from in the portfolio and how a record becomes a CV entry.
// Content is never invented: every entry is built from stored fields, and missing fields are reported, not filled in.
import { decrypt } from '../secrets.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d, style = 'month_year') {
  if (!d) return null;
  const y = d.slice(0, 4);
  if (style === 'year') return y;
  const m = Number(d.slice(5, 7));
  return m ? `${MONTHS[m - 1]} ${y}` : y;
}

export function fmtRange(start, end, { current = false, style = 'month_year' } = {}) {
  const a = fmtDate(start, style);
  const b = current ? 'Present' : fmtDate(end, style);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a || b || null;
}

const lines = (t) => (t ? String(t).split(/\r?\n/).map((s) => s.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean) : []);
const list = (t) => (t ? String(t).split(/[;\n]|,(?![^()]*\))/).map((s) => s.trim()).filter(Boolean) : []);
const join = (...xs) => xs.filter(Boolean).join(', ');
const human = (s) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '');

const SPEAKING_ROLES = ['speaker', 'facilitator', 'organizer'];

const PUB_STATUS = { in_preparation: 'In preparation', submitted: 'Submitted', under_review: 'Under review', accepted: 'Accepted / in press' };

function citation(p) {
  const year = p.publication_date ? p.publication_date.slice(0, 4) : (p.status === 'published' ? 'n.d.' : PUB_STATUS[p.status] || 'n.d.');
  const volIssue = [p.volume, p.issue ? `(${p.issue})` : ''].filter(Boolean).join('');
  const where = [p.venue, volIssue, p.pages].filter(Boolean).join(', ');
  const doi = p.doi ? `https://doi.org/${p.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : p.url || '';
  const status = p.status !== 'published' && p.publication_date ? ` [${PUB_STATUS[p.status] || human(p.status)}]` : '';
  return `${p.authors} (${year}). ${p.title}.${where ? ` ${where}.` : ''}${p.publisher && p.publication_type !== 'journal_article' ? ` ${p.publisher}.` : ''}${doi ? ` ${doi}` : ''}${status}`.replace(/\.\./g, '.');
}

/**
 * kind: 'item' (title/subtitle/dates/details), 'text' (paragraph), 'list' (comma list), 'citation' (one formatted line)
 * source: 'profile' (single synthetic entry), a resource key (one entry per record), or null (manual entries only)
 * ats: the conventional heading recommended for applicant tracking systems
 */
export const SECTIONS = [
  { key: 'summary', heading: 'Professional Summary', ats: 'Professional Summary', source: 'profile', kind: 'text',
    fromProfile: (p) => ({ text: p.biography || null, missing: p.biography ? [] : ['biography'] }) },
  { key: 'academic_profile', heading: 'Academic Profile', ats: 'Professional Summary', source: 'profile', kind: 'item',
    fromProfile: (p) => ({
      title: p.academic_designation || p.professional_title || null,
      subtitle: join(p.current_position, p.current_office, p.current_institution) || null,
      details: [p.specialization && `Specialization: ${p.specialization}`, p.career_goal && `Career objective: ${p.career_goal}`].filter(Boolean),
      missing: [!p.academic_designation && 'academic_designation', !p.current_position && 'current_position'].filter(Boolean),
    }) },
  { key: 'specialization', heading: 'Areas of Specialization', ats: 'Areas of Specialization', source: 'profile', kind: 'list',
    fromProfile: (p) => ({ items: list(p.specialization), missing: p.specialization ? [] : ['specialization'] }) },
  { key: 'research_interests', heading: 'Research Interests', ats: 'Research Interests', source: 'profile', kind: 'list',
    fromProfile: (p) => ({ items: list(p.research_interests), missing: p.research_interests ? [] : ['research_interests'] }) },

  { key: 'education', heading: 'Education', ats: 'Education', source: 'education', kind: 'item',
    map: (r, o) => ({
      title: r.major ? `${r.degree}, ${r.major}` : r.degree,
      subtitle: join(r.institution, r.location),
      org: r.institution, location: r.location || null, role: r.major ? `${r.degree}, ${r.major}` : r.degree,
      dates: r.status === 'ongoing' ? fmtRange(r.start_date, null, { current: true, style: o.dateStyle })
        : fmtDate(r.graduation_date, o.dateStyle) || fmtRange(r.start_date, r.end_date, { style: o.dateStyle }),
      details: [r.thesis_title && `Thesis: ${r.thesis_title}${r.advisor ? `. Advisor: ${r.advisor}` : ''}`, ...lines(r.distinctions)].filter(Boolean),
      note: r.status === 'units_earned' ? 'Units earned' : r.status === 'ongoing' ? 'In progress' : null,
      sortDate: r.status === 'ongoing' ? '9999' : (r.graduation_date || r.end_date || r.start_date || null),
      missing: [!r.graduation_date && !r.end_date && r.status === 'completed' && 'graduation_date'].filter(Boolean),
    }) },
  { key: 'licenses', heading: 'Licenses and Certifications', ats: 'Licenses and Certifications', source: ['licenses', 'trainings'], kind: 'item',
    filter: { trainings: (r) => r.training_type === 'certification' },
    map: (r, o, type) => type === 'licenses' ? ({
      title: r.license_type,
      subtitle: [r.issuing_authority, o.showLicenseNumbers && r.registration_number_enc ? `License No. ${decrypt(r.registration_number_enc)}` : null].filter(Boolean).join(' · '),
      dates: r.valid_until ? `${fmtDate(r.registration_date, o.dateStyle) || ''}${r.registration_date ? ' · ' : ''}Valid until ${fmtDate(r.valid_until, o.dateStyle)}` : fmtDate(r.registration_date, o.dateStyle),
      sortDate: r.registration_date,
      missing: [!r.registration_date && 'registration_date'].filter(Boolean),
    }) : ({
      title: r.title, subtitle: r.organizer, dates: fmtDate(r.start_date, o.dateStyle), sortDate: r.start_date,
      missing: [!r.start_date && 'start_date'].filter(Boolean),
    }) },
  { key: 'appointments', heading: 'Academic Appointments', ats: 'Academic Appointments', source: 'appointments', kind: 'item',
    map: (r, o) => ({
      title: r.faculty_designation ? `${r.academic_rank}, ${r.faculty_designation}` : r.academic_rank,
      subtitle: join(r.department, r.institution),
      org: r.institution, location: r.location || null,
      role: [r.faculty_designation ? `${r.academic_rank}, ${r.faculty_designation}` : r.academic_rank, r.department].filter(Boolean).join(', '),
      dates: fmtRange(r.start_date, r.end_date, { current: !!r.is_current, style: o.dateStyle }),
      details: lines(r.teaching_responsibilities),
      sortDate: r.is_current ? '9999' : r.end_date || r.start_date,
      missing: [!r.start_date && 'start_date'].filter(Boolean),
    }) },
  { key: 'employment', heading: 'Professional Experience', ats: 'Professional Experience', source: 'employment', kind: 'item',
    map: (r, o) => ({
      title: r.position,
      subtitle: join(r.office, r.institution),
      org: r.institution, location: r.location || null, role: join(r.position, r.office),
      dates: fmtRange(r.start_date, r.end_date, { current: !!r.is_current, style: o.dateStyle }),
      details: [...lines(r.responsibilities), ...lines(r.accomplishments)],
      sortDate: r.is_current ? '9999' : r.end_date || r.start_date,
      missing: [!r.start_date && 'start_date', !r.responsibilities && 'responsibilities', !r.location && 'location'].filter(Boolean),
    }) },
  { key: 'teaching', heading: 'Teaching Experience', ats: 'Teaching Experience', source: 'teaching_assignments', kind: 'item',
    map: (r) => ({
      title: [r._course_code, r._course_title].filter(Boolean).join(' — '),
      subtitle: [r._course_program, r.section && `Section ${r.section}`].filter(Boolean).join(' · '),
      dates: `${human(r.semester)} semester, AY ${r.academic_year}`,
      sortDate: `${(r.academic_year || '').slice(0, 4)}-${r.semester === 'first' ? '06' : r.semester === 'second' ? '11' : '12'}`,
    }) },
  { key: 'research', heading: 'Research Experience', ats: 'Research Experience', source: 'research_projects', kind: 'item',
    filter: { research_projects: (r) => r.status !== 'idea' && r.status !== 'discontinued' },
    map: (r, o) => ({
      title: r.title,
      subtitle: [r.role, human(r.status)].filter(Boolean).join(' · '),
      dates: fmtRange(r.start_date, r.end_date, { current: r.status !== 'completed' && !!r.start_date, style: o.dateStyle }),
      details: [r.funding && `Funding: ${r.funding}`, r.collaborators && `Collaborators: ${r.collaborators}`].filter(Boolean),
      sortDate: r.end_date || r.start_date,
      missing: [!r.start_date && 'start_date', !r.role && 'role'].filter(Boolean),
    }) },
  { key: 'publications', heading: 'Publications', ats: 'Publications', source: 'publications', kind: 'citation',
    filter: { publications: (r) => !['book', 'book_chapter'].includes(r.publication_type) },
    map: (r) => ({
      text: citation(r), title: r.title, sortDate: r.publication_date,
      missing: [!r.venue && 'venue', !r.publication_date && r.status === 'published' && 'publication_date'].filter(Boolean),
    }) },
  { key: 'books', heading: 'Books and Book Chapters', ats: 'Publications', source: 'publications', kind: 'citation',
    filter: { publications: (r) => ['book', 'book_chapter'].includes(r.publication_type) },
    map: (r) => ({ text: citation(r), title: r.title, sortDate: r.publication_date, missing: [!r.publisher && 'publisher'].filter(Boolean) }) },
  { key: 'presentations', heading: 'Conference Presentations', ats: 'Conference Presentations', source: 'presentations', kind: 'citation',
    map: (r) => {
      const d = r.presentation_date ? `${r.presentation_date.slice(0, 4)}, ${MONTHS[Number(r.presentation_date.slice(5, 7)) - 1]}` : 'n.d.';
      return {
        text: `${r.authors ? `${r.authors} ` : ''}(${d}). ${r.title} [${human(r.presentation_type)} presentation]. ${join(r.conference, r.location)}.`,
        title: r.title, sortDate: r.presentation_date, missing: [!r.presentation_date && 'presentation_date'].filter(Boolean),
      };
    } },
  { key: 'extension', heading: 'Extension and Community Engagement', ats: 'Extension and Community Engagement', source: 'extension_projects', kind: 'item',
    filter: { extension_projects: (r) => r.status !== 'cancelled' },
    map: (r, o) => ({
      title: r.title, subtitle: [join(r.partner, r.location), r.role].filter(Boolean).join(' · '),
      dates: fmtRange(r.start_date, r.end_date, { current: r.status === 'ongoing', style: o.dateStyle }),
      details: lines(r.outcomes), sortDate: r.end_date || r.start_date,
    }) },
  { key: 'awards', heading: 'Awards and Honors', ats: 'Awards and Honors', source: 'awards', kind: 'item',
    map: (r, o) => ({
      title: r.title, subtitle: [r.issuer, r.level].filter(Boolean).join(' · '), dates: fmtDate(r.date_received, o.dateStyle),
      details: lines(r.description), sortDate: r.date_received, missing: [!r.date_received && 'date_received'].filter(Boolean),
    }) },
  { key: 'development', heading: 'Professional Development', ats: 'Professional Development', source: 'trainings', kind: 'item',
    filter: { trainings: (r) => r.training_type !== 'certification' && !SPEAKING_ROLES.includes(r.role) },
    map: (r, o) => ({
      title: r.title,
      subtitle: [join(r.organizer, r.location), r.role && r.role !== 'participant' ? human(r.role) : null].filter(Boolean).join(' · '),
      dates: fmtRange(r.start_date, r.end_date, { style: o.dateStyle }),
      note: r.hours != null ? `${Number(r.hours)} hours${r.cpd_units != null ? `, ${Number(r.cpd_units)} CPD units` : ''}` : null,
      sortDate: r.start_date, missing: [!r.start_date && 'start_date', !r.organizer && 'organizer'].filter(Boolean),
    }) },
  { key: 'speaking', heading: 'Resource Speakership and Invited Talks', ats: 'Speaking Engagements', source: 'trainings', kind: 'item',
    filter: { trainings: (r) => SPEAKING_ROLES.includes(r.role) },
    map: (r, o) => ({
      title: r.title,
      subtitle: [join(r.organizer, r.location), r.role && r.role !== 'speaker' ? human(r.role) : null].filter(Boolean).join(' · '),
      dates: fmtRange(r.start_date, r.end_date, { style: o.dateStyle }),
      sortDate: r.start_date, missing: [!r.start_date && 'start_date', !r.organizer && 'organizer'].filter(Boolean),
    }) },
  { key: 'service', heading: 'Institutional Service', ats: 'Institutional Service', source: 'committees', kind: 'item',
    filter: { committees: (r) => r.assignment_type !== 'committee' },
    map: (r, o) => ({
      title: r.role ? `${r.role}, ${r.committee}` : r.committee, subtitle: r.institution,
      dates: fmtRange(r.start_date, r.end_date, { current: !!r.is_current, style: o.dateStyle }),
      details: lines(r.description), sortDate: r.is_current ? '9999' : r.end_date || r.start_date,
    }) },
  { key: 'committees', heading: 'Committee Memberships', ats: 'Institutional Service', source: 'committees', kind: 'item',
    filter: { committees: (r) => r.assignment_type === 'committee' },
    map: (r, o) => ({
      title: r.role ? `${r.role}, ${r.committee}` : r.committee, subtitle: r.institution,
      dates: fmtRange(r.start_date, r.end_date, { current: !!r.is_current, style: o.dateStyle }),
      sortDate: r.is_current ? '9999' : r.end_date || r.start_date,
    }) },
  { key: 'affiliations', heading: 'Professional Affiliations', ats: 'Professional Affiliations', source: 'memberships', kind: 'item',
    map: (r, o) => ({
      title: r.organization, subtitle: r.membership_type,
      dates: fmtRange(r.start_date, r.end_date, { current: !!r.is_current, style: o.dateStyle }),
      sortDate: r.is_current ? '9999' : r.end_date || r.start_date,
    }) },
  { key: 'grants', heading: 'Fellowships and Grants', ats: 'Awards and Honors', source: null, kind: 'item' },
  { key: 'languages', heading: 'Languages', ats: 'Languages', source: null, kind: 'list' },
  { key: 'skills', heading: 'Technical Competencies', ats: 'Technical Skills', source: null, kind: 'item' },
  { key: 'achievements', heading: 'Academic Achievements', ats: 'Awards and Honors', source: 'portfolio_entries', kind: 'item',
    map: (r, o) => ({ title: r.title, dates: fmtDate(r.event_date, o.dateStyle), details: lines(r.description), sortDate: r.event_date }) },
  { key: 'references', heading: 'References', ats: 'References', source: null, kind: 'item' },
];

export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

export const STANDARD_ATS_HEADINGS = new Set([
  'professional summary', 'summary', 'education', 'licenses and certifications', 'certifications', 'academic appointments',
  'professional experience', 'work experience', 'experience', 'employment history', 'teaching experience', 'research experience',
  'publications', 'conference presentations', 'presentations', 'extension and community engagement', 'professional development',
  'awards and honors', 'awards', 'professional affiliations', 'institutional service', 'technical skills', 'skills', 'references',
  'research interests', 'areas of specialization', 'committee memberships', 'languages', 'fellowships and grants', 'honors and awards',
]);

/** Default visible section order per CV type; every other section is created hidden. */
// Default orders follow the Harvard CV conventions (Mignone Center for Career Success guides): Education first,
// then appointments, honors and grants, scholarship, teaching, research, other experience, service, affiliations,
// languages, skills and references. Summaries are not customary on Harvard-style academic CVs, so they start hidden there.
export const DEFAULT_ORDER = {
  academic: ['education', 'appointments', 'awards', 'grants', 'publications', 'books', 'presentations', 'teaching', 'research',
    'employment', 'licenses', 'development', 'speaking', 'extension', 'service', 'committees', 'affiliations', 'research_interests', 'languages', 'skills', 'references'],
  faculty: ['education', 'appointments', 'teaching', 'licenses', 'awards', 'development', 'speaking', 'publications', 'presentations',
    'research', 'employment', 'service', 'committees', 'extension', 'affiliations', 'languages', 'references'],
  research: ['education', 'appointments', 'research_interests', 'research', 'publications', 'books', 'presentations', 'speaking', 'grants',
    'awards', 'teaching', 'employment', 'affiliations', 'languages', 'references'],
  administrative: ['summary', 'employment', 'education', 'licenses', 'service', 'committees', 'development', 'speaking', 'awards', 'skills',
    'affiliations', 'achievements', 'languages', 'references'],
  professional: ['summary', 'employment', 'education', 'licenses', 'development', 'speaking', 'awards', 'skills', 'affiliations', 'languages', 'references'],
  application: ['education', 'appointments', 'licenses', 'employment', 'teaching', 'research', 'publications', 'presentations',
    'awards', 'development', 'speaking', 'service', 'affiliations', 'languages', 'references'],
  short_bio: ['summary'],
  // Academic and professional portfolio CV: every portfolio section, in Harvard order, for a complete record.
  portfolio: ['education', 'appointments', 'employment', 'licenses', 'teaching', 'research', 'publications', 'books', 'presentations',
    'speaking', 'extension', 'awards', 'grants', 'development', 'service', 'committees', 'affiliations', 'achievements', 'research_interests', 'languages', 'skills', 'references'],
  // DBM-CHED faculty position reclassification (JC No. 01 s. 2026, Enhanced IG of JC No. 3 s. 2022): qualifications, then
  // the four Key Result Areas in order — I Instruction, II Research, III Extension, IV Professional Development.
  // Annex K asks for a CV of at most five pages, so supporting detail stays in the evidence folders.
  reclassification: ['education', 'appointments', 'employment', 'licenses', 'teaching', 'research', 'publications', 'books', 'grants',
    'extension', 'speaking', 'service', 'committees', 'affiliations', 'development', 'presentations', 'awards', 'references'],
};

/** Section headings for CV types that name their sections differently (set when the CV is created; editable). */
export const TYPE_HEADINGS = {
  reclassification: {
    teaching: 'KRA I · Instruction — Teaching',
    research: 'KRA II · Research — Research Projects', publications: 'KRA II · Research — Published Research Outputs',
    books: 'KRA II · Research — Books and Book Chapters', grants: 'KRA II · Research — Grants and Fellowships',
    extension: 'KRA III · Extension — Service to the Community', speaking: 'KRA III · Extension — Resource Speakership and Training Conducted',
    service: 'KRA III · Extension — Service to the Institution', committees: 'KRA III · Extension — Administrative Designations and Committees',
    affiliations: 'KRA IV · Professional Development — Professional Organizations',
    development: 'KRA IV · Professional Development — Conferences, Seminars and Workshops Attended',
    presentations: 'KRA IV · Professional Development — Paper Presentations', awards: 'KRA IV · Professional Development — Awards and Recognition',
  },
};

export const DEFAULT_TEMPLATE = {
  academic: 'harvard_academic', faculty: 'faculty_teaching', research: 'research', administrative: 'comprehensive',
  professional: 'modern_faculty', application: 'harvard_academic', short_bio: 'traditional_academic', portfolio: 'comprehensive', reclassification: 'traditional_academic',
};
