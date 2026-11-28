// DBM-CHED credentials checklist for faculty position reclassification in SUCs — DBM-CHED Joint Circular No. 01,
// s. 2026 (Enhanced Implementing Guidelines of JC No. 3, s. 2022), Annex A "List of Criteria and Documentary Evidences".
// The catalogue below follows Annex A: Key Result Areas → criteria (with their maximum points) → indicators (points per
// unit and the documents required). Records in the portfolio are suggested for each indicator and the faculty member
// confirms which ones to claim; point totals are an estimate only — the evaluation committees (IEC, REC, EAC, CC)
// decide what is credited.
import { RESOURCES } from '../resources.js';
import { HttpError, evidenceCounts } from '../repo.js';
import { tx } from '../db.js';

const IM_EVIDENCE = ['Cover/title page, copyright page (if any), table of contents and “about the author” page',
  'Signed evaluation report and the IM Development Committee resolution or certification approving it for use',
  'Approved syllabus or course guide listing it as a reference or course material', 'Librarian’s certification that it is in the library holdings',
  'Co-authors: Certificate of Contribution (Annex C), signed by all co-authors and certified by the Dean'];
const PUB_EVIDENCE = ['Cover/title page, copyright page, table of contents, “about the author” page and the page with publisher, year and ISBN',
  'Publisher’s guidelines on peer review, and evidence the work was peer-reviewed before publication',
  'Co-authors: Certificate of Contribution (Annex D), signed by all co-authors and certified by the Research Director'];
const PD_EVIDENCE = ['Program of the activity', 'Certificate of participation', 'Approval to attend from the SUC President (local) or Governing Board (international)',
  'Virtual activities: proof the activity ran more than 8 hours, and the host organisation’s profile, mandate, history (10+ years) and past activities'];
const PRES_EVIDENCE = ['Acceptance or invitation letter from the organiser', 'Conference program', 'Certificate of participation as paper presenter',
  'Research Director’s certification that the paper is not from a student’s thesis or dissertation', 'Approval to present from the President (local) or Governing Board (international)'];
const AWARD_EVIDENCE = ['Short description of the award', 'Certificate, or photo of the plaque, trophy or medal', 'Criteria and mechanics of the award, and the selection process',
  'Profile of the awarding organisation (mandate, history, previous awardees); for institutional awards, proof the SUC’s PRAISE guidelines are CSC-approved'];
const DESIGNATION_EVIDENCE = ['Appointment or designation with its effectivity period (at least one continuous year)',
  'Accomplishment report submitted to the immediate supervisor (Faculty Regent: annual report of the faculty association)',
  'Committees: Governing Board approval creating the committee'];
const RP_EVIDENCE = ['Invitation with title, topic, date and venue', 'Program showing the assigned topic and allotted time', 'Certificate of appreciation or similar',
  'Authorization from the President/Chancellor/VP/Campus Director (local) or Board approval (international travel)'];

/** Indicator: [code, title, points, unit, evidence]. Units: each | hour | year | rating | (number) */
const I = (code, title, points, unit = 'each', evidence = []) => ({ code, title, points, unit, evidence });

export const KRAS = [
  { code: 'I', title: 'Instruction', max: 100, criteria: [
    { code: 'I.A', title: 'Teaching Effectiveness', max: 60, indicators: [
      I('I.A.1', 'Student Evaluation of Teachers (SET) — average rating over the evaluation period', 36, 'rating',
        ['Certified final SET ratings per term (NBC 461 QCE, with transmutation to the 100-point scale) for AY 2023–2024 to 1st Sem AY 2025–2026', 'From 2nd Sem AY 2025–2026: certified FEDAF (Annex D of CMO No. 19, s. 2025)']),
      I('I.A.2', 'Supervisor’s Evaluation of Faculty (SEF) — average rating over the evaluation period', 24, 'rating',
        ['Certified final supervisor ratings per term (NBC 461 QCE, with transmutation) for AY 2023–2024 to 1st Sem AY 2025–2026', 'From 2nd Sem AY 2025–2026: certified FEDAF', 'Special status (study, maternity or sabbatical leave): the approved leave']),
    ] },
    { code: 'I.B', title: 'Instructional Materials and New Academic Degree Programs', max: 30, indicators: [
      I('I.B.1.1', 'Sole author of a textbook (developed and approved for use)', 30, 'each', IM_EVIDENCE),
      I('I.B.1.2', 'Sole author of a module', 16, 'each', ['Complete stand-alone module or complete set', ...IM_EVIDENCE.slice(1)]),
      I('I.B.1.3', 'Sole author of an instructional manual', 16, 'each', ['Complete instructional manual', ...IM_EVIDENCE.slice(1)]),
      I('I.B.1.4', 'Sole author of multimedia teaching material', 16, 'each', ['Copy of or access to the material, and evidence of pedagogical validity', ...IM_EVIDENCE.slice(1)]),
      I('I.B.2.1', 'Academic program developed or revised and implemented — lead', 10, 'each',
        ['Evidence of your contribution to the program', 'Dean’s certification of your role', 'Academic Council resolution', 'Governing Board resolution', 'Valid RRPA or COPC']),
      I('I.B.2.2', 'Academic program developed or revised and implemented — contributor', 5, 'each',
        ['Evidence of your contribution to the program', 'Dean’s certification of your role', 'Academic Council resolution', 'Governing Board resolution', 'Valid RRPA or COPC']),
    ] },
    { code: 'I.C', title: 'Research Advising and Mentorship Services', max: 10, indicators: [
      ...[['SP', 'special or capstone project', 3, 1], ['UT', 'undergraduate thesis', 5, 1], ['MT', 'master’s thesis', 8, 2], ['DD', 'doctoral dissertation', 10, 2]].flatMap(([k, l, a, p]) => [
        I(`I.C.1.1.${k}`, `Adviser — ${l}`, a, 'each', ['Signed approval sheet (title, students, adviser, panel, date of approval)', 'RRPA or COPC of the program']),
        I(`I.C.1.2.${k}`, `Panel member — ${l}`, p, 'each', ['Signed approval sheet (title, students, adviser, panel, date of approval)', 'RRPA or COPC of the program']),
      ]),
      I('I.C.2', 'Mentor or coach of students who won a major prize (regional, national or international)', 3, 'each',
        ['Designation as mentor/coach from the SUC President', 'Award certificate or photo of the trophy, plaque or medal', 'Mechanics of the competition showing the major winners', 'Profile, mandate, history and previous winners of the awarding organisation']),
    ] },
  ] },
  { code: 'II', title: 'Research, Innovation and/or Creative Work', max: 100, criteria: [
    { code: 'II.A', title: 'Research Outputs', max: 100, indicators: [
      I('II.A.1', 'Sole author of an academic book', 100, 'each', PUB_EVIDENCE),
      I('II.A.2', 'Sole author of an edited academic book chapter', 35, 'each', ['Cover, copyright, contents and publisher/ISBN pages of the edited book', 'Full text of your chapter', 'Publisher’s editorial policy, and evidence of editing before publication', PUB_EVIDENCE[2]]),
      I('II.A.3', 'Sole author of a journal article (Scopus, Web of Science or ASEAN Citation Index)', 50, 'each',
        ['The published article (scan of the printed version or link)', 'Research Director’s certification that the journal was indexed in Scopus, WoS or ACI at the time of publication', 'Journals in Filipino: see Section 19, item 3(e)', PUB_EVIDENCE[2]]),
      I('II.A.4', 'Sole author of an academic monograph', 100, 'each', PUB_EVIDENCE),
      I('II.A.5', 'Research output translated into a project, policy or product (max 70)', 35, 'each',
        ['The completed research output, and proof it was presented, published or submitted', 'Project: description, notarized MOA (or Board-approved proposal), proof of completion', 'Policy: proof of approval, the policy document, and proof the research informed it', 'Product: description, proof of utilization, photos']),
      I('II.A.6', 'Research publication cited (local max 40, international max 60)', null, 'each',
        ['Your cited publication', 'The citing article (indexed journal)', 'Research Director’s certification']),
    ] },
    { code: 'II.B', title: 'Inventions', max: 100, indicators: [
      I('II.B.1.1', 'Invention patent (points by stage, sole inventor)', null, 'each', ['Photo of the invention', 'Special Order naming the inventors', 'Documents for each stage (filing, publication, grant)', 'Co-inventors: certificate of contribution']),
      I('II.B.1.2', 'Commercialized patented product — local / international', 5, 'each', ['Photo of the product', 'Patent certificate', 'Licensing agreement or proof of commercialization', 'Research Director’s certification']),
      I('II.B.1.3', 'Utility model (10) or industrial design (5)', 10, 'each', ['Photo', 'Special Order', 'Certificate of registration', 'Co-inventors: certificate of contribution']),
      I('II.B.2.1', 'Copyrighted and utilized software — new (10) or updated (4)', 10, 'each', ['Special Order naming the developers', 'User manual or design document', 'Copyright certificate', 'End-user certification of use']),
      I('II.B.2.2', 'New plant variety, animal breed or microbial strain', 10, 'each', ['Registration or certificate', 'Certification from the agriculturist or an independent body', 'Photo or field documentation']),
    ] },
    { code: 'II.C', title: 'Creative Works', max: 100, indicators: [
      I('II.C.1', 'Creative work produced, performed, exhibited or published (composition, choreography, play, visual art, design, film: 20; performance: 10)', 20, 'each',
        ['The work, or documentation of it', 'Proof of invitation, acceptance or official selection', 'Proof of first performance, exhibition or screening', 'Certification from the organiser, director or Dean', 'Co-creators: certificate of contribution']),
      ...[['1', 'novel', 20], ['2', 'short story', 10], ['3', 'poetry', 2], ['4', 'literary essay', 2]].map(([c, t, p]) => I(`II.C.2.${c}`, `Literary publication — ${t}`, p, 'each',
        ['Copy of the published work (anthology, magazine or journal issue; copyrighted book for a novel)', 'Publisher’s guidelines on editorial review and selection',
          'Evidence of editorial review before publication', 'Proof of the publisher’s credibility (NBDB, National Library or ISSN registry, affiliation, history)',
          'Co-authors: Certificate of Contribution (Creative Works), signed by all and certified by the Dean'])),
    ] },
  ] },
  { code: 'III', title: 'Extension Services', max: 100, criteria: [
    { code: 'III.A', title: 'Service to the Institution', max: 30, indicators: [
      I('III.A.1', 'Successful linkage, networking or partnership activity', 5, 'each',
        ['Approval to enter the partnership (Board, President or Chancellor)', 'Notarized MOA/MOU (or the signed project proposal)', 'Implementation or terminal report received by the SUC', 'Certification that the partnership came from your initiative']),
      I('III.A.2', 'Contribution to income generation (lead: 2–18; contributor: 1–9, by amount)', null, 'each',
        ['Financial report certified by the SUC Accountant, or the Sub-ARO for external grants', 'Certification from the Head of Finance acknowledging your contribution']),
    ] },
    { code: 'III.B', title: 'Service to the Community', max: 50, indicators: [
      I('III.B.1.1.1', 'Accreditation, evaluation or assessment work — local', 8, 'each', ['Appointment as evaluator/accreditor/assessor', 'Proof of actual engagement (travel order, report, certificate)', 'Authorization from the SUC President', 'Agency profile if not on the list']),
      I('III.B.1.1.2', 'Accreditation, evaluation or assessment work — international', 10, 'each', ['Appointment as evaluator/accreditor/assessor', 'Proof of actual engagement', 'Authorization from the SUC President', 'Agency profile if not on the list']),
      I('III.B.1.2.1', 'Judge or examiner — research awards', 2, 'each', ['Official invitation', 'Announcement and guidelines of the award', 'Certificate or program showing your role', 'Authorization from the President or VP', 'Organiser’s profile (non-government)']),
      I('III.B.1.2.2', 'Judge or examiner — academic competitions', 1, 'each', ['Official invitation', 'Announcement and guidelines of the competition', 'Certificate or program showing your role', 'Authorization from the President or VP']),
      I('III.B.1.3.1', 'Short-term consultant or expert — local', 8, 'each', ['Written agreement, contract or engagement letter', 'Consultancy report or output', 'Authorization from the SUC']),
      I('III.B.1.3.2', 'Short-term consultant or expert — international', 10, 'each', ['Written agreement, contract or engagement letter', 'Consultancy report or output', 'Board approval']),
      I('III.B.1.4', 'Media service (occasional column 2, regular column 10, TV/radio host 10, guest expert 1)', 2, 'each', ['Compiled articles, or contract/invitation', 'Link or copy of the publication or broadcast']),
      I('III.B.1.5.1', 'Resource person, facilitator, moderator, plenary speaker or panelist — local (per hour)', 2, 'hour', RP_EVIDENCE),
      I('III.B.1.5.2', 'Resource person, facilitator, moderator, plenary speaker or panelist — international (per hour)', 3, 'hour', RP_EVIDENCE),
      I('III.B.2.1.1', 'Extension project activity — lead/head (ISR, max 30)', 5, 'each', ['Special Order listing the faculty and their roles', 'Board-approved extension project proposal', 'Evidence of your role', 'Status or terminal report noted by the extension office']),
      I('III.B.2.1.2', 'Extension project activity — participant (ISR, max 30)', 2, 'each', ['Special Order listing the faculty and their roles', 'Board-approved extension project proposal', 'Evidence of your role', 'Status or terminal report noted by the extension office']),
    ] },
    { code: 'III.C', title: 'Relevance and Quality of Extension Services', max: 20, indicators: [
      I('III.C.1', 'Client satisfaction rating for extension projects (average over three years)', 20, 'rating',
        ['Summary of client satisfaction ratings certified by the extension head (to 2nd Sem AY 2024–25)', 'From 1st Sem AY 2025–26: Extension Project CSS Report (CMO No. 18, s. 2025)', 'The project must also be claimed under Institutional Social Responsibility']),
    ] },
    { code: 'III.D', title: 'Bonus — Administrative Designation (per year)', max: 20, bonus: true, indicators: [
      ...[['1.1.1', 'President or OIC President', 20], ['1.1.2', 'Vice-President', 15], ['1.1.3', 'Chancellor', 10], ['1.1.4', 'Vice-Chancellor', 8], ['1.1.5', 'Campus Director/Administrator', 8],
        ['1.1.6', 'Faculty Trustee/Regent', 8], ['1.1.7', 'Office Director', 6], ['1.1.8', 'University/College Secretary', 6], ['1.1.9', 'Project Head (institutional)', 4],
        ['1.1.10a', 'Institution-level committee — chair', 3], ['1.1.10b', 'Institution-level committee — member', 2], ['1.1.11', 'Coordinator (institutional)', 2],
        ['1.2.1', 'Dean', 6], ['1.2.2', 'Associate Dean', 5], ['1.2.3', 'College Secretary', 3], ['1.2.4', 'Department Head', 4], ['1.2.5', 'Program Chair/Project Head', 3],
        ['1.2.6a', 'Department-level committee — chair', 2], ['1.2.6b', 'Department-level committee — member', 1], ['1.2.7', 'Coordinator (college/department)', 1]]
        .map(([c, t, p]) => I(`III.D.${c}`, t, p, 'year', DESIGNATION_EVIDENCE)),
    ] },
  ] },
  { code: 'IV', title: 'Professional Development', max: 100, criteria: [
    { code: 'IV.A', title: 'Involvement in Professional Organizations', max: 20, indicators: [
      I('IV.A.1', 'Membership and active participation in a registered professional organization aligned with your specialization', 5, 'each',
        ['Valid certificate of membership or ID', 'Non-APO: SEC registration and profile (national scope, 10+ years, conventions in the past 3 years); international: profile and website',
          'Evidence of your specific role in an organisation activity (online activities not counted)', 'Certification from the head of the organisation (activity, date, your role)']),
    ] },
    { code: 'IV.B', title: 'Continuing Development', max: 60, indicators: [
      I('IV.B.1.1', 'Post-master’s diploma or certificate', 10, 'each', ['Local: CAV copy of the transcript of records', 'Foreign (self-funded): diploma and CHED certificate of equivalency if the name differs', 'Foreign (SUC scholarship): diploma and scholarship contract']),
      I('IV.B.1.2', 'Post-doctorate diploma or certificate', 10, 'each', ['Local: CAV copy of the transcript of records', 'Foreign: diploma (and CHED equivalency or scholarship contract)']),
      I('IV.B.1.3', 'Additional master’s degree', 20, 'each', ['Local: CAV copy of the transcript of records', 'Foreign: diploma (and CHED equivalency or scholarship contract)']),
      I('IV.B.1.4', 'Doctorate or additional doctorate degree', 40, 'each', ['Local: CAV copy of the transcript of records', 'Foreign: diploma (and CHED equivalency or scholarship contract)']),
      I('IV.B.2.1', 'Conference, seminar, workshop or industry immersion attended — local (max 10)', 1, 'each', PD_EVIDENCE),
      I('IV.B.2.2', 'Conference, seminar, workshop or industry immersion attended — international (max 10)', 2, 'each', [...PD_EVIDENCE, 'Held in the Philippines with a foreign co-organiser: proof of co-sponsorship and of at least three countries represented']),
      I('IV.B.3.1', 'Paper presentation in a conference — local (max 10)', 3, 'each', PRES_EVIDENCE),
      I('IV.B.3.2', 'Paper presentation in a conference — international (max 10)', 5, 'each', [...PRES_EVIDENCE, 'Held in the Philippines with a foreign co-organiser: proof of at least three countries represented']),
    ] },
    { code: 'IV.C', title: 'Awards and Recognition', max: 20, indicators: [
      I('IV.C.1.1', 'Award of distinction — institutional', 2, 'each', AWARD_EVIDENCE),
      I('IV.C.1.2', 'Award of distinction — local or regional (city, municipality, province)', 3, 'each', AWARD_EVIDENCE),
      I('IV.C.1.3', 'Award of distinction — national', 4, 'each', AWARD_EVIDENCE),
    ] },
    { code: 'IV.D', title: 'Bonus — Newly Appointed Faculty (per year)', max: 20, bonus: true, indicators: [
      I('IV.D.1.1', 'Full-time academic service in a higher education institution — President', 5, 'year', ['Service record, certificate of employment or appointment', 'Brief job description']),
      I('IV.D.1.2', 'Full-time academic service — Vice President, Dean or Director', 4, 'year', ['Service record, certificate of employment or appointment', 'Brief job description']),
      I('IV.D.1.3', 'Full-time academic service — Department or Program Head', 3, 'year', ['Service record, certificate of employment or appointment', 'Brief job description']),
      I('IV.D.1.4', 'Full-time academic service — faculty member', 2, 'year', ['Service record, certificate of employment or appointment', 'Brief job description']),
      I('IV.D.2.1', 'Industry experience — managerial or supervisory', 4, 'year', ['Service record, certificate of employment or appointment', 'Brief job description']),
      I('IV.D.2.2', 'Industry experience — technical and skilled', 3, 'year', ['Service record, certificate of employment or appointment', 'Brief job description']),
      I('IV.D.2.3', 'Industry experience — support or administrative staff', 2, 'year', ['Service record, certificate of employment or appointment', 'Brief job description']),
    ] },
  ] },
];

export const SOURCE = 'DBM-CHED Joint Circular No. 01, s. 2026 — Enhanced Implementing Guidelines of DBM-CHED JC No. 3, s. 2022 (Annex A: List of Criteria and Documentary Evidences)';
const INDICATORS = new Map(KRAS.flatMap((k) => k.criteria.flatMap((c) => c.indicators.map((i) => [i.code, { ...i, criterion: c, kra: k }]))));
// Criterion sub-caps stated in Annex A (on top of the criterion maximum).
const SUBCAPS = [['II.A.5', 70], ['III.B.2.1', 30], ['IV.B.2', 10], ['IV.B.3', 10]];

const has = (v, re) => re.test(String(v || ''));
const year = (d) => String(d || '').slice(0, 4);
const ABROAD = /\b(?!philippines\b)(usa|united states|japan|korea|singapore|malaysia|thailand|indonesia|vietnam|china|taiwan|hong kong|australia|new zealand|canada|uk|united kingdom|germany|france|italy|spain|india|uae|dubai|qatar|saudi|netherlands|sweden|switzerland|brunei|cambodia|myanmar|laos|online \(international\))\b/i;

/** Which indicator a portfolio record most likely belongs to (the faculty member confirms or changes it). */
function suggest(type, r) {
  switch (type) {
    case 'trainings': {
      const abroad = has(r.location, ABROAD) || has(r.title, /\binternational\b/i);
      if (['speaker', 'facilitator'].includes(r.role)) return { indicator: abroad ? 'III.B.1.5.2' : 'III.B.1.5.1', quantity: Number(r.hours) || 1 };
      if (r.role === 'organizer') return null;
      return { indicator: abroad ? 'IV.B.2.2' : 'IV.B.2.1' };
    }
    case 'presentations': return { indicator: has(r.location, ABROAD) || has(r.conference, /\binternational\b/i) ? 'IV.B.3.2' : 'IV.B.3.1' };
    case 'memberships': return { indicator: 'IV.A.1' };
    case 'awards': {
      const l = `${r.level || ''} ${r.issuer || ''}`;
      if (has(l, /national|international|ched|prc|dost|civil service/i)) return { indicator: 'IV.C.1.3' };
      if (has(l, /city|municipal|province|provincial|region|local/i)) return { indicator: 'IV.C.1.2' };
      return { indicator: 'IV.C.1.1' };
    }
    case 'education': {
      if (r.status && r.status !== 'completed') return null;
      if (has(r.degree, /post[- ]?doc/i)) return { indicator: 'IV.B.1.2' };
      if (has(r.degree, /doctor|ph\.?\s?d|ed\.?\s?d|d\.?b\.?a|dpa/i)) return { indicator: 'IV.B.1.4' };
      if (has(r.degree, /diploma|certificate/i) && has(r.degree, /post|graduate/i)) return { indicator: 'IV.B.1.1' };
      if (has(r.degree, /master|m\.?a\.?\b|m\.?s\.?\b|m\.?ed|mba|mpa|maed|mat\b/i)) return { indicator: 'IV.B.1.3', note: 'Credited only as an additional master’s degree' };
      return null;
    }
    case 'publications': {
      if (r.status !== 'published') return null;
      if (r.publication_type === 'book') return { indicator: 'II.A.1' };
      if (r.publication_type === 'book_chapter') return { indicator: 'II.A.2' };
      if (r.publication_type === 'journal_article') return { indicator: 'II.A.3' };
      return null;
    }
    case 'portfolio_entries': {
      const k = `${r.category || ''} ${r.title || ''}`;
      if (!has(r.category, /creative|literary|novel|short story|poem|poetry|essay/i)) return null;
      if (has(k, /novel/i)) return { indicator: 'II.C.2.1' };
      if (has(k, /poem|poetry/i)) return { indicator: 'II.C.2.3' };
      if (has(k, /essay/i) && !has(k, /short story/i)) return { indicator: 'II.C.2.4' };
      return { indicator: 'II.C.2.2' };
    }
    case 'materials': {
      const k = `${r.material_type || ''} ${r.title || ''}`;
      if (has(k, /textbook/i)) return { indicator: 'I.B.1.1' };
      if (has(k, /manual/i)) return { indicator: 'I.B.1.3' };
      if (has(k, /video|multimedia|e-?learning|software|presentation/i)) return { indicator: 'I.B.1.4' };
      return { indicator: 'I.B.1.2' };
    }
    case 'extension_projects': {
      if (r.project_type === 'training_conducted') return { indicator: 'III.B.1.5.1', quantity: Number(r.training_hours) || 1 };
      return { indicator: has(r.role, /lead|head|director|coordinator|proponent|leader/i) ? 'III.B.2.1.1' : 'III.B.2.1.2' };
    }
    case 'committees': {
      const role = String(r.role || ''); const inst = r.assignment_type !== 'committee' || has(r.committee, /university|institution|campus/i);
      const yrs = Math.max(1, Math.floor(((r.end_date ? new Date(r.end_date) : new Date()) - new Date(r.start_date || Date.now())) / 31557600000));
      const pick = (code) => ({ indicator: code, quantity: yrs });
      if (has(role, /\bdean\b/i)) return pick(has(role, /associate/i) ? 'III.D.1.2.2' : 'III.D.1.2.1');
      if (has(role, /department head|dept\.? head|chairperson of the department/i)) return pick('III.D.1.2.4');
      if (has(role, /program (chair|head)|project head/i)) return pick('III.D.1.2.5');
      if (has(role, /director/i)) return pick('III.D.1.1.7');
      if (has(role, /secretary/i)) return pick(inst ? 'III.D.1.1.8' : 'III.D.1.2.3');
      if (has(role, /coordinator/i)) return pick(inst ? 'III.D.1.1.11' : 'III.D.1.2.7');
      if (has(role, /chair/i)) return pick(inst ? 'III.D.1.1.10a' : 'III.D.1.2.6a');
      return pick(inst ? 'III.D.1.1.10b' : 'III.D.1.2.6b');
    }
    default: return null;
  }
}
const SOURCES = ['trainings', 'presentations', 'memberships', 'awards', 'education', 'publications', 'materials', 'extension_projects', 'committees', 'portfolio_entries'];
export { suggest, SOURCES };

function recordsOf(db, userId, type) {
  const r = RESOURCES[type]; if (!r) return [];
  return db.prepare(`SELECT * FROM ${r.table} WHERE user_id = ? AND deleted_at IS NULL`).all(userId);
}
function label(type, r) {
  const res = RESOURCES[type]; const t = res?.title && r[res.title];
  const d = res?.date && r[res.date];
  return { title: String(t || r.title || r.degree || r.organization || r.committee || `${res?.label || type} #${r.id}`), date: d ? String(d) : null };
}

const DOC_STATUS = ['secured', 'missing', 'pending', 'na'];
/** Short column headings for the document grid (the full wording stays in the tooltip and the checklist). */
const SHORT = [
  [/^valid rrpa/i, 'RRPA / COPC'], [/^organiser’s profile/i, 'Org profile'], [/^project:/i, 'Project proof'], [/^policy:/i, 'Policy proof'], [/^product:/i, 'Product proof'],
  [/^certification from the head of finance/i, 'Finance cert.'], [/^certification from the agriculturist/i, 'Certification'], [/^certification from the organiser/i, 'Certification'],
  [/^copy of or access/i, 'Material copy'], [/^dean’s certification/i, 'Dean’s cert.'], [/^documents for each stage/i, 'Stage documents'], [/^end-user/i, 'End-user cert.'],
  [/^evidence of your contribution/i, 'Contribution proof'], [/^financial report/i, 'Financial report'], [/^licensing agreement/i, 'Licensing / sales'],
  [/^designation as mentor/i, 'Designation'], [/^complete stand-alone module/i, 'Module copy'], [/^complete instructional manual/i, 'Manual copy'],
  [/^registration or certificate/i, 'Registration'], [/^photo or field/i, 'Photos'], [/^photo of the/i, 'Photo'], [/^the work, or documentation/i, 'Work copy'],
  [/^proof of first performance/i, 'First performance'], [/^proof of invitation, acceptance/i, 'Selection proof'], [/^user manual/i, 'User manual'],
  [/^academic council/i, 'Council resolution'], [/^governing board resolution/i, 'Board resolution'], [/^certificate of registration/i, 'Registration cert.'],
  [/^invitation|official invitation/i, 'Invitation'], [/^acceptance or invitation/i, 'Acceptance'], [/^program|conference program/i, 'Program'],
  [/^certificate of participation as paper/i, 'Certificate'], [/^certificate of (appreciation|participation)|certificate or program showing/i, 'Certificate'],
  [/^authori[sz]ation|approval to (attend|present)/i, 'Approval'], [/research director’s certification that the paper/i, 'RD cert.'],
  [/research director’s certification that the journal/i, 'Indexing cert.'], [/^the published article/i, 'Article copy'],
  [/^virtual activities|held in the philippines|journals in filipino/i, 'If applicable'],
  [/^local: cav/i, 'CAV / TOR'], [/^foreign/i, 'Foreign diploma'], [/valid certificate of membership/i, 'Membership ID'],
  [/^non-apo/i, 'Org profile'], [/specific role/i, 'Role evidence'], [/head of the organisation/i, 'Head’s cert.'],
  [/^short description of the award/i, 'Description'], [/^certificate, or photo|award certificate or photo/i, 'Certificate / photo'],
  [/criteria and mechanics|mechanics of the competition/i, 'Mechanics'], [/^profile of the awarding|profile, mandate, history/i, 'Org profile'],
  [/co-authors|co-inventors|co-creators/i, 'Contribution cert.'], [/^special order/i, 'Special Order'], [/approved extension project proposal|board-approved/i, 'Approved proposal'],
  [/evidence of your role/i, 'Role evidence'], [/status or terminal report/i, 'Terminal report'], [/^appointment or designation/i, 'Designation'],
  [/accomplishment report/i, 'Accomplishment rpt.'], [/^committees: governing board/i, 'Board approval'], [/service record/i, 'Service record'],
  [/brief job description/i, 'Job description'], [/signed approval sheet/i, 'Approval sheet'], [/^rrpa or copc/i, 'RRPA / COPC'],
  [/^cover\/title page|^cover, copyright/i, 'Title pages'], [/^signed evaluation report/i, 'Evaluation / IMDC'], [/syllabus or course guide/i, 'Syllabus listing'],
  [/^librarian/i, 'Library cert.'], [/publisher’s (guidelines|editorial)/i, 'Peer-review proof'], [/^full text of your chapter/i, 'Chapter text'],
  [/certified final set|certified final supervisor/i, 'QCE ratings'], [/fedaf/i, 'FEDAF'], [/^special status/i, 'Leave approval'],
  [/^copy of the published work|^copy of the publication/i, 'Publication copy'], [/evidence of editorial review/i, 'Review proof'], [/publisher’s credibility/i, 'Publisher proof'],
  [/^approval to enter/i, 'Approval'], [/notarized moa/i, 'MOA / MOU'], [/implementation or terminal report/i, 'Terminal report'], [/came from your initiative/i, 'Initiative cert.'],
  [/^appointment as evaluator/i, 'Appointment'], [/proof of actual engagement/i, 'Engagement proof'], [/agency profile/i, 'Agency profile'],
  [/announcement and guidelines/i, 'Guidelines'], [/written agreement/i, 'Contract'], [/consultancy report/i, 'Report'], [/^board approval/i, 'Board approval'],
  [/summary of client satisfaction|css report/i, 'CSS report'], [/must also be claimed/i, 'ISR claim'], [/compiled articles/i, 'Articles / contract'], [/link or copy of the publication/i, 'Link / copy'],
  [/the completed research output/i, 'Research output'], [/^project:/i, 'Project proof'], [/^policy:/i, 'Policy proof'], [/^product:/i, 'Product proof'],
  [/your cited publication/i, 'Cited work'], [/the citing article/i, 'Citing article'], [/^research director’s certification$/i, 'RD cert.'],
];
const shortOf = (label) => SHORT.find(([re]) => re.test(label))?.[1] || label.split(/[,(;—]/)[0].split(' ').slice(0, 3).join(' ');
function docsOf(ind, claim) {
  let saved = {};
  try { saved = JSON.parse(claim.docs_json || '{}') || {}; } catch { saved = {}; }
  return ind.evidence.map((label, i) => ({ index: i, label, short: shortOf(label), status: DOC_STATUS.includes(saved[i]) ? saved[i] : 'unset' }));
}

/** Points an indicator contributes for a claimed quantity (ratings are 0–100, scaled to the indicator's weight). */
const pointsFor = (ind, quantity) => (ind.points == null ? 0 : ind.unit === 'rating' ? (ind.points * Math.min(100, Math.max(0, quantity))) / 100 : ind.points * quantity);

export function checklist(db, userId) {
  const claims = db.prepare('SELECT * FROM jc_claims WHERE user_id = ? ORDER BY id').all(userId);
  const byKey = new Map(); // "type:id" → record
  const suggestions = new Map(); // indicator → [{type,id,...}]
  for (const type of SOURCES) {
    const rows = recordsOf(db, userId, type);
    const ev = evidenceCounts(db, RESOURCES[type], rows.map((r) => r.id));
    for (const r of rows) {
      const info = { type, id: r.id, ...label(type, r), evidence: ev[r.id] || 0 };
      byKey.set(`${type}:${r.id}`, info);
      const s = suggest(type, r);
      if (s && INDICATORS.has(s.indicator)) (suggestions.get(s.indicator) || suggestions.set(s.indicator, []).get(s.indicator)).push({ ...info, quantity: s.quantity || 1, note: s.note || null });
    }
  }
  const claimed = new Set(claims.filter((c) => c.entity_type !== 'note').map((c) => `${c.entity_type}:${c.entity_id}`));
  let total = 0; let projected = 0;
  const kras = KRAS.map((k) => {
    let kraPts = 0; let bonus = 0;
    const criteria = k.criteria.map((c) => {
      let crit = 0;
      const sub = new Map();
      const indicators = c.indicators.map((ind) => {
        const mine = claims.filter((x) => x.indicator === ind.code).map((x) => ({
          claim_id: x.id, quantity: x.quantity, note: x.note, status: x.status, docs: docsOf(ind, x),
          ...(x.entity_type === 'note' ? { type: 'note', id: null, title: x.note || 'Claim without a record', date: null, evidence: 0 } : byKey.get(`${x.entity_type}:${x.entity_id}`) || { type: x.entity_type, id: x.entity_id, title: 'Record no longer in the portfolio', date: null, evidence: 0, missing: true }),
        }));
        let pts = mine.filter((m) => !m.missing && m.status === 'claimed').reduce((n, m) => n + pointsFor(ind, m.quantity), 0);
        projected += mine.filter((m) => m.status === 'planned').reduce((n, m) => n + pointsFor(ind, m.quantity), 0);
        const cap = SUBCAPS.find(([p]) => ind.code.startsWith(p));
        if (cap) { const used = sub.get(cap[0]) || 0; pts = Math.min(pts, Math.max(0, cap[1] - used)); sub.set(cap[0], used + pts); }
        crit += pts;
        return { ...ind, evidence_short: ind.evidence.map(shortOf), claims: mine, estimated: Math.round(pts * 100) / 100,
          suggestions: (suggestions.get(ind.code) || []).filter((s) => !claimed.has(`${s.type}:${s.id}`)) };
      });
      const capped = Math.min(crit, c.max);
      if (c.bonus) bonus += capped; else kraPts += capped;
      return { code: c.code, title: c.title, max: c.max, bonus: !!c.bonus, estimated: Math.round(capped * 100) / 100, indicators };
    });
    const est = Math.min(k.max, kraPts + bonus);
    total += est;
    return { code: k.code, title: k.title, max: k.max, estimated: Math.round(est * 100) / 100, criteria };
  });
  const flat = kras.flatMap((k) => k.criteria.flatMap((c) => c.indicators.flatMap((i) => i.claims.map((cl) => ({ ...cl, ind: i, kra: k.code })))));
  const earned = flat.filter((c) => c.status === 'claimed');
  const docs = earned.flatMap((c) => c.docs);
  // What to do next: missing or pending documents, the highest-value claims first.
  const actions = earned.flatMap((c) => c.docs.filter((d) => d.status === 'missing' || d.status === 'pending' || d.status === 'unset')
    .map((d) => ({ claim_id: c.claim_id, indicator: c.ind.code, kra: c.kra, record: c.title, document: d.label, status: d.status, value: pointsFor(c.ind, c.quantity) })))
    .sort((a, b) => (a.status === 'missing' ? 0 : a.status === 'unset' ? 1 : 2) - (b.status === 'missing' ? 0 : b.status === 'unset' ? 1 : 2) || b.value - a.value).slice(0, 40);
  return {
    source: SOURCE, kras, total: Math.round(total * 100) / 100, projected: Math.round(projected * 100) / 100,
    counts: {
      claims: earned.length, planned: flat.length - earned.length, with_evidence: earned.filter((c) => c.evidence > 0).length,
      suggestions: kras.reduce((n, k) => n + k.criteria.reduce((m, c) => m + c.indicators.reduce((o, i) => o + i.suggestions.length, 0), 0), 0),
      docs_total: docs.filter((d) => d.status !== 'na').length, docs_secured: docs.filter((d) => d.status === 'secured').length,
      docs_missing: docs.filter((d) => d.status === 'missing').length, docs_pending: docs.filter((d) => d.status === 'pending').length,
      docs_unchecked: docs.filter((d) => d.status === 'unset').length,
    },
    actions,
    note: 'Points are an estimate from your own claims. Only the evaluation committees decide what is credited; claims need the documents listed under each indicator.',
  };
}

export function addClaim(db, userId, body = {}) {
  const ind = INDICATORS.get(String(body.indicator || ''));
  if (!ind) throw new HttpError(422, 'Choose an indicator from the checklist', { indicator: 'Unknown indicator' });
  const quantity = body.quantity == null || body.quantity === '' ? 1 : Number(body.quantity);
  const qmax = ind.unit === 'rating' ? 100 : 1000;
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > qmax) throw new HttpError(422, ind.unit === 'rating' ? 'Enter the rating (1–100)' : 'Enter a quantity greater than zero', { quantity: ind.unit === 'rating' ? '1–100' : 'More than 0' });
  const note = body.note == null ? null : String(body.note).trim().slice(0, 500) || null;
  const status = body.status === 'planned' ? 'planned' : 'claimed';
  const docs = cleanDocs(ind, body.docs);
  if (body.type === 'note' || !body.type) {
    if (!note) throw new HttpError(422, 'Describe what you are claiming', { note: 'Required when no record is chosen' });
    return tx(db, () => db.prepare("INSERT INTO jc_claims (user_id, indicator, entity_type, entity_id, quantity, note, status, docs_json) VALUES (?, ?, 'note', (SELECT COALESCE(MAX(entity_id), 0) + 1 FROM jc_claims WHERE user_id = ? AND entity_type = 'note'), ?, ?, ?, ?) RETURNING id").get(userId, ind.code, userId, quantity, note, status, docs));
  }
  if (!SOURCES.includes(body.type)) throw new HttpError(422, 'That kind of record cannot be claimed here', { type: SOURCES.join(', ') });
  const r = RESOURCES[body.type];
  if (!db.prepare(`SELECT 1 FROM ${r.table} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).get(Number(body.id), userId)) throw new HttpError(404, `${r.label} not found`);
  try {
    return db.prepare('INSERT INTO jc_claims (user_id, indicator, entity_type, entity_id, quantity, note, status, docs_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id').get(userId, ind.code, body.type, Number(body.id), quantity, note, status, docs);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'That record is already claimed under this indicator');
    throw e;
  }
}

function cleanDocs(ind, docs, base = {}) {
  if (docs == null) return Object.keys(base).length ? JSON.stringify(base) : null;
  if (typeof docs !== 'object' || Array.isArray(docs)) throw new HttpError(422, 'Document statuses are not in the expected form');
  const out = { ...base };
  for (const [k, v] of Object.entries(docs)) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= ind.evidence.length) throw new HttpError(422, 'Unknown document for this indicator');
    if (v === null || v === 'unset') delete out[i];
    else if (DOC_STATUS.includes(v)) out[i] = v;
    else throw new HttpError(422, 'Document status must be secured, missing, pending or not applicable');
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

export function updateClaim(db, userId, id, body = {}) {
  const c = db.prepare('SELECT * FROM jc_claims WHERE id = ? AND user_id = ?').get(Number(id), userId);
  if (!c) throw new HttpError(404, 'Claim not found');
  const ind = INDICATORS.get('indicator' in body ? String(body.indicator) : c.indicator);
  if (!ind) throw new HttpError(422, 'Choose an indicator from the checklist', { indicator: 'Unknown indicator' });
  const q = 'quantity' in body ? Number(body.quantity) : c.quantity;
  if (!Number.isFinite(q) || q <= 0 || q > (ind.unit === 'rating' ? 100 : 1000)) throw new HttpError(422, 'Enter a valid quantity', { quantity: ind.unit === 'rating' ? '1–100' : 'More than 0' });
  const note = 'note' in body ? (String(body.note || '').trim().slice(0, 500) || null) : c.note;
  const status = 'status' in body ? (body.status === 'planned' ? 'planned' : 'claimed') : c.status;
  let base = {}; try { base = JSON.parse(c.docs_json || '{}') || {}; } catch { base = {}; }
  // A different indicator has a different document list, so its statuses start afresh.
  const docs = ind.code === c.indicator ? cleanDocs(ind, body.docs, base) : cleanDocs(ind, body.docs);
  try {
    db.prepare('UPDATE jc_claims SET indicator = ?, quantity = ?, note = ?, status = ?, docs_json = ? WHERE id = ?').run(ind.code, q, note, status, docs, c.id);
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'That record is already claimed under that indicator'); throw e; }
  return { id: c.id };
}

export function removeClaim(db, userId, id) {
  const r = db.prepare('DELETE FROM jc_claims WHERE id = ? AND user_id = ?').run(Number(id), userId);
  if (!r.changes) throw new HttpError(404, 'Claim not found');
  return { ok: true };
}

export { INDICATORS };

// ── Exports: Word / PDF (landscape grids) and Excel (a tracker workbook) ──
const MARK = { secured: '✔', missing: '✘', pending: '…', na: '—', unset: '☐' };
const MARK_WORD = { secured: 'Secured', missing: 'Missing', pending: 'Pending', na: 'N/A', unset: 'Not checked' };
const numTxt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
const claimPts = (ind, cl) => (ind.points == null ? 0 : ind.unit === 'rating' ? (ind.points * cl.quantity) / 100 : ind.points * cl.quantity);

export async function exportChecklist(db, userId, { format = 'docx' } = {}, { pdfRenderer } = {}) {
  if (!['docx', 'pdf', 'xlsx'].includes(format)) throw new HttpError(422, 'Choose Word, PDF or Excel');
  const c = checklist(db, userId);
  if (!c.counts.claims && !c.counts.planned) throw new HttpError(422, 'Claim at least one record in the Credentials Tracker first.');
  const prof = db.prepare('SELECT full_name, current_position, current_institution FROM professional_profiles WHERE user_id = ?').get(userId) || {};
  const today = new Date().toISOString().slice(0, 10);
  const claimed = (k) => k.criteria.flatMap((cr) => cr.indicators.filter((i) => i.claims.length).map((i) => ({ cr, i })));
  const goals = c.kras.flatMap((k) => k.criteria.flatMap((cr) => cr.indicators.flatMap((i) => i.claims.filter((x) => x.status === 'planned').map((x) => ({ i, x })))));
  if (format === 'xlsx') return exportWorkbook(db, userId, c, prof, claimed, goals, today);

  const { heading, para, tableOf } = await import('../richdoc.js');
  const { render } = await import('../research/exports.js');
  const labelled = (k, v) => ({ type: 'paragraph', content: [{ type: 'text', text: `${k}: `, marks: [{ type: 'bold' }] }, { type: 'text', text: v }] });
  const content = [
    heading('Credentials Tracker — Faculty Position Reclassification', 1, 'center'),
    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'DBM-CHED Joint Circular No. 01, s. 2026 (Enhanced IG of JC No. 3, s. 2022) · Annex A: List of Criteria and Documentary Evidences', marks: [{ type: 'italic' }] }] },
    labelled('Name', prof.full_name || '—'),
    ...(prof.current_position || prof.current_institution ? [labelled('Position', [prof.current_position, prof.current_institution].filter(Boolean).join(', '))] : []),
    labelled('As of', today),
    labelled('Documents', `${c.counts.docs_secured} secured · ${c.counts.docs_missing} missing · ${c.counts.docs_pending} pending · ${c.counts.docs_unchecked} not yet checked (of ${c.counts.docs_total})`),
    heading('Summary of estimated points', 2),
    tableOf([
      [{ text: 'Key Result Area', width: 28 }, { text: 'Criterion', width: 44 }, { text: 'Maximum', width: 14, align: 'center' }, { text: 'Estimated', width: 14, align: 'center' }],
      ...c.kras.flatMap((k) => [
        ...k.criteria.map((cr, n) => [{ text: n === 0 ? `KRA ${k.code} — ${k.title}` : '', bold: n === 0 }, { text: `${cr.code.split('.').pop()}. ${cr.title}${cr.bonus ? ' (bonus)' : ''}` }, { text: String(cr.max), align: 'center' }, { text: numTxt(cr.estimated), align: 'center' }]),
        [{ text: '' }, { text: `Total for KRA ${k.code} (maximum ${k.max})`, bold: true, align: 'right' }, { text: String(k.max), align: 'center', bold: true }, { text: numTxt(k.estimated), align: 'center', bold: true }],
      ]),
      [{ text: 'All KRAs', bold: true, colspan: 2, align: 'right' }, { text: '400', align: 'center', bold: true }, { text: numTxt(c.total), align: 'center', bold: true }],
    ]),
    para(`Planned goals would add ${numTxt(c.projected)} points when completed. Estimates come from the claims recorded here; the evaluation committees decide what is credited.`),
    para('Key: ✔ secured · ✘ missing · … pending · — not applicable · ☐ not yet checked.'),
  ];
  for (const k of c.kras) {
    const list = claimed(k);
    if (!list.length) continue;
    content.push(heading(`KRA ${k.code} — ${k.title} (estimated ${numTxt(k.estimated)} of ${k.max})`, 2));
    let lastCr = null;
    for (const { cr, i } of list) {
      if (cr !== lastCr) { content.push(heading(`Criterion ${cr.code.split('.').pop()} — ${cr.title} (maximum ${cr.max}${cr.bonus ? ', bonus' : ''}; estimated ${numTxt(cr.estimated)})`, 3)); lastCr = cr; }
      content.push(para(`${i.code.replace(/^[IV]+\./, '')}  ${i.title}${i.points != null ? ` — ${i.points} point${i.points === 1 ? '' : 's'}${i.unit === 'each' ? ' each' : i.unit === 'rating' ? ' × rating ÷ 100' : ` per ${i.unit}`}` : ''}`, { bold: true }));
      const docW = Math.max(7, Math.min(12, Math.floor(58 / i.evidence.length)));
      const recW = 100 - docW * i.evidence.length - 8;
      content.push(tableOf([
        [{ text: 'Record', width: recW }, ...i.evidence_short.map((h) => ({ text: h, width: docW, align: 'center' })), { text: 'Points', width: 8, align: 'center' }],
        ...i.claims.map((cl) => [
          { text: `${cl.title}${cl.date ? ` (${cl.date})` : ''}${cl.status === 'planned' ? ' — planned' : ''}${i.unit !== 'each' ? ` · ${i.unit === 'rating' ? `${numTxt(cl.quantity)}%` : `${numTxt(cl.quantity)} ${i.unit}${cl.quantity === 1 ? '' : 's'}`}` : ''}` },
          ...cl.docs.map((d) => ({ text: MARK[d.status], align: 'center', bold: d.status === 'missing' })),
          { text: cl.status === 'planned' ? `(+${numTxt(claimPts(i, cl))})` : numTxt(claimPts(i, cl)), align: 'center' },
        ]),
      ]));
    }
  }
  if (c.actions.length) {
    content.push(heading('Documents to secure next', 2));
    content.push(tableOf([[{ text: 'Document', width: 44 }, { text: 'For', width: 36 }, { text: 'Requirement', width: 10, align: 'center' }, { text: 'Status', width: 10, align: 'center' }],
      ...c.actions.map((a) => [{ text: a.document }, { text: a.record }, { text: a.indicator, align: 'center' }, { text: MARK_WORD[a.status], align: 'center', bold: a.status === 'missing' }])]));
  }
  if (goals.length) {
    content.push(heading('Planned goals', 2));
    content.push(tableOf([[{ text: 'Goal', width: 40 }, { text: 'Requirement', width: 46 }, { text: 'Points', width: 14, align: 'center' }],
      ...goals.map(({ i, x }) => [{ text: `${x.title}${x.note ? ` — ${x.note}` : ''}` }, { text: `${i.code} ${i.title}` }, { text: `+${numTxt(claimPts(i, x))}`, align: 'center' }])]));
  }
  content.push(para(`Source: ${SOURCE}.`));
  return render(db, userId, { doc: { type: 'doc', content }, title: 'Credentials Tracker', format, landscape: true, type: 'jc_checklist', fileStem: 'Credentials_Tracker_DBM-CHED', pdfRenderer });
}

async function exportWorkbook(db, userId, c, prof, claimed, goals, today) {
  const ExcelJS = (await import('exceljs')).default;
  const { saveReport } = await import('../academic/docs.js');
  const wb = new ExcelJS.Workbook(); wb.creator = 'SYNCHRONIA'; wb.created = new Date();
  const FONT = 'Calibri';
  const thin = { style: 'thin', color: { argb: 'FFB9B9C6' } }; const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const HEAD = fill('FF3B1F73'); const SUB = fill('FFEDE7F8'); const KRA = fill('FF6D3FD1');
  const STATUS_FILL = { secured: fill('FFD9F2E2'), missing: fill('FFFBDADA'), pending: fill('FFFFF1CC'), na: fill('FFF1F1F4'), unset: null };
  const setup = (ws) => { ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }; ws.headerFooter.oddFooter = '&L&8Credentials Tracker — DBM-CHED JC No. 01, s. 2026&R&8Page &P of &N'; };
  const title = (ws, t, sub, cols) => {
    ws.mergeCells(1, 1, 1, cols); Object.assign(ws.getCell(1, 1), { value: t, font: { name: FONT, size: 15, bold: true, color: { argb: 'FFFFFFFF' } }, fill: HEAD, alignment: { vertical: 'middle' } }); ws.getRow(1).height = 26;
    ws.mergeCells(2, 1, 2, cols); Object.assign(ws.getCell(2, 1), { value: sub, font: { name: FONT, size: 9, italic: true, color: { argb: 'FF555566' } } });
  };

  // Summary
  const sum = wb.addWorksheet('Summary'); setup(sum);
  sum.columns = [{ width: 34 }, { width: 58 }, { width: 12 }, { width: 12 }];
  title(sum, 'CREDENTIALS TRACKER — FACULTY POSITION RECLASSIFICATION', `DBM-CHED JC No. 01, s. 2026 (Enhanced IG of JC No. 3, s. 2022), Annex A · ${prof.full_name || ''}${prof.current_position ? `, ${prof.current_position}` : ''} · as of ${today}`, 4);
  const sh = sum.addRow(['Key Result Area', 'Criterion', 'Maximum', 'Estimated']); sh.eachCell((x) => { x.font = { name: FONT, bold: true, size: 10 }; x.fill = SUB; x.border = box; });
  for (const k of c.kras) {
    k.criteria.forEach((cr, n) => { const r = sum.addRow([n === 0 ? `KRA ${k.code} — ${k.title}` : '', `${cr.code.split('.').pop()}. ${cr.title}${cr.bonus ? ' (bonus)' : ''}`, cr.max, cr.estimated]); r.eachCell({ includeEmpty: true }, (x, i) => { x.border = box; x.font = { name: FONT, size: 10, bold: i === 1 }; x.alignment = { vertical: 'top', wrapText: true, horizontal: i > 2 ? 'center' : 'left' }; }); });
    const t = sum.addRow(['', `Total for KRA ${k.code}`, k.max, k.estimated]); t.eachCell({ includeEmpty: true }, (x, i) => { x.border = box; x.font = { name: FONT, size: 10, bold: true }; x.alignment = { horizontal: i > 2 ? 'center' : 'right' }; });
  }
  const tot = sum.addRow(['', 'All KRAs', 400, c.total]); tot.eachCell({ includeEmpty: true }, (x, i) => { x.border = box; x.font = { name: FONT, size: 11, bold: true }; x.fill = SUB; x.alignment = { horizontal: i > 2 ? 'center' : 'right' }; });
  sum.addRow([]);
  for (const [k, v] of [['Planned goals (when completed)', `+${numTxt(c.projected)} points`], ['Documents secured', `${c.counts.docs_secured} of ${c.counts.docs_total}`], ['Missing', c.counts.docs_missing], ['Pending', c.counts.docs_pending], ['Not yet checked', c.counts.docs_unchecked]]) {
    const r = sum.addRow([k, v]); r.getCell(1).font = { name: FONT, bold: true, size: 10 }; r.getCell(2).font = { name: FONT, size: 10 };
  }
  sum.addRow([]); sum.addRow(['Key: ✔ secured · ✘ missing · … pending · — not applicable · ☐ not yet checked. Estimates come from your own claims; the evaluation committees decide what is credited.']).getCell(1).font = { name: FONT, italic: true, size: 9 };

  // One sheet per KRA: a block per requirement, records × documents
  for (const k of c.kras) {
    const list = claimed(k);
    const ws = wb.addWorksheet(`KRA ${k.code}`); setup(ws);
    const maxDocs = Math.max(1, ...list.map(({ i }) => i.evidence.length));
    const cols = 3 + maxDocs + 1;
    ws.columns = [{ width: 46 }, { width: 12 }, { width: 8 }, ...Array.from({ length: maxDocs + 1 }, () => ({ width: 14 }))];
    title(ws, `KRA ${k.code} — ${k.title.toUpperCase()}`, `Estimated ${numTxt(k.estimated)} of ${k.max} points`, cols);
    if (!list.length) { ws.addRow([]); ws.addRow(['Nothing claimed under this KRA yet.']).getCell(1).font = { name: FONT, italic: true, size: 10 }; continue; }
    let lastCr = null;
    for (const { cr, i } of list) {
      if (cr !== lastCr) {
        ws.addRow([]);
        const r = ws.addRow([`Criterion ${cr.code.split('.').pop()} — ${cr.title} (maximum ${cr.max}${cr.bonus ? ', bonus' : ''}; estimated ${numTxt(cr.estimated)})`]);
        ws.mergeCells(r.number, 1, r.number, cols); Object.assign(r.getCell(1), { font: { name: FONT, bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: KRA });
        lastCr = cr;
      }
      const ir = ws.addRow([`${i.code}  ${i.title}`, i.points == null ? 'see guidelines' : `${i.points} ${i.unit === 'each' ? 'each' : i.unit === 'rating' ? '× rating' : `per ${i.unit}`}`]);
      ws.mergeCells(ir.number, 2, ir.number, cols); ir.getCell(1).font = { name: FONT, bold: true, size: 10 }; ir.getCell(2).font = { name: FONT, size: 10, color: { argb: 'FF555566' } }; ir.getCell(1).alignment = { wrapText: true, vertical: 'top' };
      ir.height = Math.max(16, Math.ceil(`${i.code}  ${i.title}`.length / 48) * 14);
      // Points sits right after this requirement's own document columns, so no empty columns open up in the block.
      const last = 4 + i.evidence.length;
      const hr = ws.addRow(['Record', 'Date', i.unit === 'each' ? '—' : i.unit === 'rating' ? 'Rating' : i.unit === 'hour' ? 'Hours' : 'Years', ...i.evidence_short, 'Points']);
      hr.eachCell({ includeEmpty: true }, (x, n) => { if (n <= last) { x.fill = SUB; x.border = box; } x.font = { name: FONT, bold: true, size: 9 }; x.alignment = { horizontal: n === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true }; });
      i.evidence.forEach((full, n) => { hr.getCell(4 + n).note = full; });
      hr.height = 28;
      for (const cl of i.claims) {
        const r = ws.addRow([`${cl.title}${cl.status === 'planned' ? ' (planned)' : ''}`, cl.date || '', i.unit === 'each' ? '' : cl.quantity, ...cl.docs.map((d) => MARK[d.status]), cl.status === 'planned' ? `+${numTxt(claimPts(i, cl))}` : claimPts(i, cl)]);
        r.eachCell({ includeEmpty: true }, (x, n) => {
          if (n > last) return;
          x.border = box; x.font = { name: FONT, size: 10 }; x.alignment = { horizontal: n === 1 ? 'left' : 'center', vertical: 'top', wrapText: n === 1 };
          if (n === last) x.font = { name: FONT, size: 10, bold: true };
          const d = n < last ? cl.docs[n - 4] : null; if (d) { x.fill = STATUS_FILL[d.status] || undefined; x.font = { name: FONT, size: 11, bold: d.status === 'missing', color: { argb: d.status === 'missing' ? 'FFC62828' : d.status === 'secured' ? 'FF1B7A3D' : 'FF333333' } }; }
        });
        r.height = Math.max(16, Math.ceil(r.getCell(1).value.length / 46) * 14);
      }
    }
    ws.views = [{ state: 'frozen', ySplit: 2 }];
  }

  // Documents to secure, and planned goals
  const todo = wb.addWorksheet('Documents to secure'); setup(todo);
  todo.columns = [{ width: 56 }, { width: 46 }, { width: 14 }, { width: 12 }];
  title(todo, 'DOCUMENTS TO SECURE', 'Missing first, then the claims worth most', 4);
  const th = todo.addRow(['Document', 'For', 'Requirement', 'Status']); th.eachCell((x) => { x.font = { name: FONT, bold: true, size: 10 }; x.fill = SUB; x.border = box; });
  const rows = c.kras.flatMap((k) => k.criteria.flatMap((cr) => cr.indicators.flatMap((i) => i.claims.filter((x) => x.status === 'claimed').flatMap((x) => x.docs.filter((d) => d.status !== 'secured' && d.status !== 'na').map((d) => ({ d, x, i }))))))
    .sort((a, b) => (a.d.status === 'missing' ? 0 : a.d.status === 'unset' ? 1 : 2) - (b.d.status === 'missing' ? 0 : b.d.status === 'unset' ? 1 : 2));
  for (const { d, x, i } of rows) {
    const r = todo.addRow([d.label, x.title, i.code, MARK_WORD[d.status]]);
    r.eachCell((y, n) => { y.border = box; y.font = { name: FONT, size: 10, bold: n === 4 && d.status === 'missing', color: n === 4 && d.status === 'missing' ? { argb: 'FFC62828' } : undefined }; y.alignment = { wrapText: true, vertical: 'top', horizontal: n > 2 ? 'center' : 'left' }; });
    if (STATUS_FILL[d.status]) r.getCell(4).fill = STATUS_FILL[d.status];
  }
  if (!rows.length) todo.addRow(['Every claimed document is secured or not applicable.']);
  todo.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rows.length, column: 4 } };
  todo.views = [{ state: 'frozen', ySplit: 3 }];

  const gs = wb.addWorksheet('Planned goals'); setup(gs);
  gs.columns = [{ width: 46 }, { width: 14 }, { width: 56 }, { width: 12 }];
  title(gs, 'PLANNED GOALS', `+${numTxt(c.projected)} points when completed`, 4);
  const gh = gs.addRow(['Goal', 'Requirement', 'Indicator', 'Points']); gh.eachCell((x) => { x.font = { name: FONT, bold: true, size: 10 }; x.fill = SUB; x.border = box; });
  for (const { i, x } of goals) {
    const r = gs.addRow([`${x.title}${x.note ? ` — ${x.note}` : ''}`, i.code, i.title, claimPts(i, x)]);
    r.eachCell((y, n) => { y.border = box; y.font = { name: FONT, size: 10 }; y.alignment = { wrapText: true, vertical: 'top', horizontal: n === 2 || n === 4 ? 'center' : 'left' }; });
  }
  if (!goals.length) gs.addRow(['No planned goals.']);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return saveReport(db, userId, { type: 'jc_checklist', title: 'Credentials Tracker', buffer, format: 'xlsx', fileStem: 'Credentials_Tracker_DBM-CHED', expect: [] });
}
