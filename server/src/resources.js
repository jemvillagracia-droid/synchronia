// Resource registry — the single description of every structured record type.
// The generic API, validation, search indexing, audit logging and dashboard all read from here.

const VERIFICATION = ['self_reported', 'user_confirmed', 'evidence_verified'];

const text = (o = {}) => ({ type: 'text', max: 500, ...o });
const long = (o = {}) => ({ type: 'text', max: 20000, ...o });
const date = (o = {}) => ({ type: 'date', ...o });
const int = (o = {}) => ({ type: 'int', ...o });
const real = (o = {}) => ({ type: 'real', ...o });
const bool = (o = {}) => ({ type: 'bool', ...o });
const oneOf = (values, o = {}) => ({ type: 'enum', values, ...o });
const json = (o = {}) => ({ type: 'json', ...o });
const ref = (resource, o = {}) => ({ type: 'ref', resource, ...o });
const secret = (o = {}) => ({ type: 'secret', ...o });
const req = { required: true };

const verification = { verification: oneOf(VERIFICATION), notes: long() };

/**
 * module   — sidebar module the record belongs to
 * group    — portfolio grouping used by dashboard completeness metrics
 * title    — field used as the record's display title
 * subtitle — fields joined for a secondary line
 * date     — the event date (distinct from created_at) used for timelines
 */
export const RESOURCES = {
  education: {
    table: 'education_records', label: 'Education', module: 'portfolio', group: 'education',
    title: 'degree', subtitle: ['institution', 'major'], date: 'graduation_date',
    recommended: ['major', 'location', 'graduation_date'],
    fields: {
      degree: text(req), major: text(), institution: text(req), location: text(),
      start_date: date(), end_date: date(), graduation_date: date(),
      status: oneOf(['completed', 'ongoing', 'units_earned']), distinctions: long(), ...verification,
    },
  },
  licenses: {
    table: 'licenses', label: 'Professional License', module: 'portfolio', group: 'licenses',
    title: 'license_type', subtitle: ['issuing_authority'], date: 'registration_date',
    recommended: ['registration_number', 'registration_date', 'valid_until'],
    fields: {
      license_type: text(req), registration_number: secret(), issuing_authority: text(req),
      registration_date: date(), valid_until: date(), ...verification,
    },
  },
  employment: {
    table: 'employment_records', label: 'Employment', module: 'portfolio', group: 'employment',
    title: 'position', subtitle: ['institution', 'office'], date: 'start_date',
    recommended: ['office', 'start_date', 'responsibilities'],
    fields: {
      position: text(req), institution: text(req), office: text(), employment_type: text(),
      start_date: date(), end_date: date(), is_current: bool(),
      responsibilities: long(), accomplishments: long(), ...verification,
    },
  },
  appointments: {
    table: 'academic_appointments', label: 'Academic Appointment', module: 'portfolio', group: 'appointments',
    title: 'academic_rank', subtitle: ['institution', 'department'], date: 'start_date',
    recommended: ['faculty_designation', 'department', 'start_date', 'teaching_responsibilities'],
    fields: {
      academic_rank: text(req), faculty_designation: text(), institution: text(req), department: text(),
      start_date: date(), end_date: date(), is_current: bool(), teaching_responsibilities: long(), ...verification,
    },
  },
  trainings: {
    table: 'training_records', label: 'Professional Development', module: 'portfolio', group: 'development',
    title: 'title', subtitle: ['organizer', 'training_type'], date: 'start_date',
    recommended: ['organizer', 'start_date', 'hours'],
    fields: {
      title: text(req),
      training_type: oneOf(['training', 'seminar', 'workshop', 'conference', 'webinar', 'course', 'certification', 'other']),
      role: oneOf(['participant', 'speaker', 'facilitator', 'organizer']),
      organizer: text(), location: text(), start_date: date(), end_date: date(),
      hours: real({ min: 0 }), cpd_units: real({ min: 0 }), ...verification,
    },
  },
  awards: {
    table: 'awards', label: 'Award', module: 'portfolio', group: 'awards',
    title: 'title', subtitle: ['issuer'], date: 'date_received',
    recommended: ['issuer', 'date_received', 'description'],
    fields: { title: text(req), issuer: text(), date_received: date(), level: text(), description: long(), ...verification },
  },
  memberships: {
    table: 'professional_memberships', label: 'Professional Affiliation', module: 'portfolio', group: 'service',
    title: 'organization', subtitle: ['membership_type'], date: 'start_date',
    recommended: ['membership_type', 'start_date'],
    fields: {
      organization: text(req), membership_type: text(), member_id: text(),
      start_date: date(), end_date: date(), is_current: bool(), ...verification,
    },
  },
  committees: {
    table: 'committee_assignments', label: 'Institutional Service', module: 'portfolio', group: 'service',
    title: 'committee', subtitle: ['role', 'institution'], date: 'start_date',
    recommended: ['role', 'institution', 'start_date'],
    fields: {
      committee: text(req), role: text(), institution: text(),
      assignment_type: oneOf(['committee', 'secretariat', 'administrative', 'institutional_project', 'academic_service', 'leadership']),
      start_date: date(), end_date: date(), is_current: bool(), description: long(), ...verification,
    },
  },
  portfolio_entries: {
    table: 'portfolio_entries', label: 'Accomplishment', module: 'portfolio', group: 'accomplishments',
    title: 'title', subtitle: ['category'], date: 'event_date',
    recommended: ['event_date', 'description'],
    fields: { category: text(), title: text(req), description: long(), event_date: date(), verification: oneOf(VERIFICATION) },
  },

  courses: {
    table: 'courses', label: 'Course', module: 'academic', title: 'title', subtitle: ['code', 'program'],
    fields: { code: text(req), title: text(req), description: long(), units: real({ min: 0 }), program: text(), level: text() },
  },
  teaching_assignments: {
    table: 'teaching_assignments', label: 'Teaching Assignment', module: 'academic',
    title: 'academic_year', subtitle: ['semester', 'section'],
    fields: {
      course_id: ref('courses', req), appointment_id: ref('appointments'), academic_year: text(req),
      semester: oneOf(['first', 'second', 'summer', 'other'], req), section: text(), schedule: text(),
      student_count: int({ min: 0 }), status: oneOf(['planned', 'active', 'completed']),
    },
  },
  syllabi: {
    table: 'syllabi', label: 'Syllabus', module: 'academic', title: 'version_label', subtitle: ['academic_year', 'semester'],
    fields: {
      course_id: ref('courses', req), version_label: text(), academic_year: text(), semester: text(),
      status: oneOf(['draft', 'for_review', 'approved', 'archived']), content_json: json(),
    },
  },
  learning_outcomes: {
    table: 'learning_outcomes', label: 'Learning Outcome', module: 'academic', title: 'code', subtitle: ['description'],
    fields: {
      course_id: ref('courses'), syllabus_id: ref('syllabi'), outcome_type: oneOf(['CLO', 'PO', 'ILO'], req),
      code: text(req), description: long(req), sort_order: int(),
    },
  },
  materials: {
    table: 'instructional_materials', label: 'Instructional Material', module: 'academic',
    title: 'title', subtitle: ['material_type'], date: 'event_date',
    fields: {
      course_id: ref('courses'), title: text(req),
      material_type: oneOf(['lesson_plan', 'weekly_plan', 'module', 'slides', 'handout', 'learning_resource', 'activity', 'other']),
      description: long(), status: oneOf(['draft', 'in_use', 'archived']), event_date: date(),
    },
  },
  assessments: {
    table: 'assessments', label: 'Assessment', module: 'academic', title: 'title', subtitle: ['assessment_type'], date: 'scheduled_date',
    fields: {
      course_id: ref('courses'), title: text(req),
      assessment_type: oneOf(['quiz', 'exam', 'midterm', 'final', 'project', 'performance_task', 'assignment', 'other']),
      scheduled_date: date(), total_points: real({ min: 0 }), status: oneOf(['draft', 'ready', 'administered', 'graded']),
    },
  },
  tos: {
    table: 'tables_of_specifications', label: 'Table of Specifications', module: 'academic', title: 'title',
    fields: { assessment_id: ref('assessments'), title: text(req), content_json: json() },
  },
  rubrics: {
    table: 'rubrics', label: 'Rubric', module: 'academic', title: 'title',
    fields: { course_id: ref('courses'), assessment_id: ref('assessments'), title: text(req), criteria_json: json() },
  },

  research_projects: {
    table: 'research_projects', label: 'Research Project', module: 'academic', group: 'research',
    title: 'title', subtitle: ['status', 'role'], date: 'start_date',
    recommended: ['role', 'start_date', 'objectives', 'methodology'],
    fields: {
      title: text(req), role: text(),
      status: oneOf(['idea', 'proposal', 'approved', 'data_collection', 'analysis', 'writing', 'completed', 'discontinued']),
      start_date: date(), end_date: date(), research_questions: long(), objectives: long(), methodology: long(),
      instruments: long(), ethics_reference: text(), collaborators: long(), funding: text(), ...verification,
    },
  },
  publications: {
    table: 'publications', label: 'Publication', module: 'academic', group: 'research',
    title: 'title', subtitle: ['venue', 'status'], date: 'publication_date',
    recommended: ['venue', 'publication_date'],
    fields: {
      research_project_id: ref('research_projects'), title: text(req), authors: text({ required: true, max: 2000 }),
      publication_type: oneOf(['journal_article', 'book', 'book_chapter', 'conference_paper', 'report', 'thesis', 'other']),
      venue: text(), publisher: text(), volume: text(), issue: text(), pages: text(), publication_date: date(),
      doi: text(), url: text({ max: 2000 }),
      status: oneOf(['in_preparation', 'submitted', 'under_review', 'accepted', 'published']), indexing: text(), ...verification,
    },
  },
  presentations: {
    table: 'conference_presentations', label: 'Conference Presentation', module: 'academic', group: 'research',
    title: 'title', subtitle: ['conference'], date: 'presentation_date',
    recommended: ['location', 'presentation_date'],
    fields: {
      research_project_id: ref('research_projects'), title: text(req), authors: text({ max: 2000 }), conference: text(req),
      location: text(), presentation_date: date(),
      presentation_type: oneOf(['oral', 'poster', 'keynote', 'panel', 'workshop', 'other']), ...verification,
    },
  },
  extension_projects: {
    table: 'extension_projects', label: 'Extension Project', module: 'academic',
    title: 'title', subtitle: ['partner', 'status'], date: 'start_date',
    fields: {
      title: text(req),
      project_type: oneOf(['extension_project', 'community_program', 'training_conducted', 'seminar', 'engagement', 'other']),
      partner: text(), location: text(), start_date: date(), end_date: date(),
      status: oneOf(['planned', 'ongoing', 'completed', 'cancelled']), beneficiaries: long(),
      objectives: long(), outcomes: long(), narrative: long(), ...verification,
    },
  },

  activities: {
    table: 'activities', label: 'Activity', module: 'nexus', title: 'title', subtitle: ['kind'], date: 'event_date',
    fields: {
      kind: oneOf(['activity', 'idea', 'research_note', 'accomplishment', 'meeting'], req), title: text(req), body: long(),
      event_date: date(), module: oneOf(['general', 'teaching', 'research', 'extension', 'development', 'portfolio', 'admin']),
      source: oneOf(['manual', 'quick_capture']),
    },
  },
  tasks: {
    table: 'tasks', label: 'Task', module: 'nexus', title: 'title', subtitle: ['module', 'priority'], date: 'due_date',
    fields: {
      title: text(req), notes: long(), due_date: date(), is_deadline: bool(),
      priority: oneOf(['low', 'normal', 'high', 'urgent']), status: oneOf(['open', 'in_progress', 'done', 'cancelled']),
      module: oneOf(['general', 'teaching', 'research', 'extension', 'development', 'portfolio', 'cv', 'admin']),
      linked_entity_type: text(), linked_entity_id: int(),
    },
  },
  correspondence: {
    table: 'administrative_transactions', label: 'Correspondence', module: 'admin',
    title: 'subject', subtitle: ['direction', 'counterpart'], date: 'document_date',
    fields: {
      direction: oneOf(['incoming', 'outgoing'], req), reference_no: text(), subject: text(req), counterpart: text(),
      office: text(), document_date: date(), logged_date: date(), due_date: date(),
      status: oneOf(['received', 'routed', 'in_progress', 'for_follow_up', 'completed', 'archived']),
      routing_json: json(), remarks: long(),
    },
  },
  file_references: {
    table: 'external_file_references', label: 'File Reference', module: 'knowledge', title: 'title', subtitle: ['provider'],
    fields: {
      provider: oneOf(['google_drive', 'url', 'local_path'], req), external_id: text(), url: text({ max: 2000 }),
      title: text(req), mime_type: text(), metadata_json: json(),
    },
  },
  cv_profiles: {
    table: 'cv_profiles', label: 'CV Profile', module: 'cv', title: 'name', subtitle: ['cv_type', 'status'],
    fields: {
      name: text(req), cv_type: oneOf(['academic', 'professional', 'faculty', 'research', 'administrative', 'short_bio', 'application']),
      template_id: { type: 'int' }, settings_json: json(),
    },
  },
};

// Searchable text: every text field (secrets and JSON excluded).
for (const [key, r] of Object.entries(RESOURCES)) {
  r.key = key;
  r.searchFields = Object.entries(r.fields).filter(([, f]) => f.type === 'text').map(([n]) => n);
}

// Professional Portfolio categories (Directive Section V, B–I, plus general accomplishments).
export const PORTFOLIO_GROUPS = [
  { key: 'education', label: 'Educational Background', resources: ['education'] },
  { key: 'licenses', label: 'Professional Licenses', resources: ['licenses'] },
  { key: 'employment', label: 'Employment History', resources: ['employment'] },
  { key: 'appointments', label: 'Academic Appointments', resources: ['appointments'] },
  { key: 'research', label: 'Research and Publications', resources: ['publications', 'presentations', 'research_projects'] },
  { key: 'development', label: 'Professional Development', resources: ['trainings'] },
  { key: 'service', label: 'Institutional Service', resources: ['committees', 'memberships'] },
  { key: 'awards', label: 'Awards and Recognition', resources: ['awards'] },
  { key: 'accomplishments', label: 'Accomplishments', resources: ['portfolio_entries'] },
];

/** Pairs of date fields that must be in chronological order when both are present. */
export const DATE_ORDER = [['start_date', 'end_date'], ['registration_date', 'valid_until']];

export const byTable = Object.fromEntries(Object.values(RESOURCES).map((r) => [r.table, r]));
