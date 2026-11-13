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
const time = (o = {}) => ({ type: 'text', max: 5, format: 'time', pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMessage: 'Use HH:MM (24-hour)', ...o });

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
      degree: text(req), major: text(), institution: text(req), location: text(), thesis_title: text({ max: 1000 }), advisor: text(),
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
    recommended: ['office', 'location', 'start_date', 'responsibilities'],
    fields: {
      position: text(req), institution: text(req), office: text(), location: text(), employment_type: text(),
      start_date: date(), end_date: date(), is_current: bool(),
      responsibilities: long(), accomplishments: long(), ...verification,
    },
  },
  appointments: {
    table: 'academic_appointments', label: 'Academic Appointment', module: 'portfolio', group: 'appointments',
    title: 'academic_rank', subtitle: ['institution', 'department'], date: 'start_date',
    recommended: ['faculty_designation', 'department', 'start_date', 'teaching_responsibilities'],
    fields: {
      academic_rank: text(req), faculty_designation: text(), institution: text(req), department: text(), location: text(),
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
    fields: { code: text(req), title: text(req), description: long(), units: real({ min: 0 }), contact_hours: int({ min: 0, max: 1000 }), program: text(), level: text() },
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
      code: text(req), description: long(req), program: text(), group_label: text(), sort_order: int(),
    },
  },
  materials: {
    table: 'instructional_materials', label: 'Instructional Material', module: 'academic',
    title: 'title', subtitle: ['material_type'], date: 'event_date',
    fields: {
      course_id: ref('courses'), teaching_assignment_id: ref('teaching_assignments'), title: text(req),
      material_type: oneOf(['lesson_plan', 'weekly_plan', 'module', 'slides', 'handout', 'learning_resource', 'activity', 'other']),
      week_no: int({ min: 1, max: 30 }), clo_codes: text(), description: long(), status: oneOf(['draft', 'in_use', 'archived']), event_date: date(),
      content_json: json(),
    },
  },
  assessments: {
    table: 'assessments', label: 'Assessment', module: 'academic', title: 'title', subtitle: ['assessment_type'], date: 'scheduled_date',
    fields: {
      course_id: ref('courses'), teaching_assignment_id: ref('teaching_assignments'), title: text(req),
      assessment_type: oneOf(['quiz', 'exam', 'midterm', 'final', 'project', 'performance_task', 'assignment', 'other']),
      scheduled_date: date(), total_points: real({ min: 0 }), item_count: int({ min: 0, max: 1000 }), clo_codes: text(),
      status: oneOf(['draft', 'ready', 'administered', 'graded']),
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
      instruments: long(), ethics_reference: text(), collaborators: long(), funding: text(),
      progress_pct: int({ min: 0, max: 100 }), target_sample: int({ min: 0 }), collected_sample: int({ min: 0 }),
      validation_status: oneOf(['not_started', 'in_progress', 'validated', 'not_applicable']),
      ethics_status: oneOf(['not_required', 'to_submit', 'under_review', 'approved', 'revisions_requested']), ...verification,
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
      status: oneOf(['planned', 'ongoing', 'completed', 'cancelled']), role: text(), beneficiaries: long(),
      participants_count: int({ min: 0 }), training_hours: real({ min: 0 }),
      objectives: long(), outcomes: long(), narrative: long(), ...verification,
    },
  },

  class_activities: {
    table: 'class_activities', label: 'Class Activity', module: 'academic', title: 'title', subtitle: ['activity_type'], date: 'activity_date',
    fields: {
      teaching_assignment_id: ref('teaching_assignments', req), activity_date: date(req), title: text(req),
      activity_type: oneOf(['lecture', 'laboratory', 'activity', 'assessment', 'consultation', 'field_work', 'other']),
      description: long(), present: int({ min: 0 }), enrolled: int({ min: 0 }), notes: long(),
    },
  },
  development_goals: {
    table: 'development_goals', label: 'Development Goal', module: 'academic', title: 'title', subtitle: ['goal_area', 'status'], date: 'target_date',
    fields: {
      goal_area: oneOf(['teaching', 'research', 'extension', 'professional', 'qualification']), title: text(req), description: long(),
      target_date: date(), status: oneOf(['planned', 'in_progress', 'achieved', 'deferred']), progress_pct: int({ min: 0, max: 100 }),
      linked_training_id: ref('trainings'),
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
      doc_type: oneOf(['memorandum', 'letter', 'resolution', 'report', 'request', 'invitation', 'endorsement', 'notice', 'other']),
      office: text(), document_date: date(), logged_date: date(), due_date: date(),
      status: oneOf(['received', 'routed', 'in_progress', 'for_follow_up', 'completed', 'archived']),
      action_required: long(), action_taken: long(), completed_date: date(),
      routing_json: json(), remarks: long(),
    },
  },
  meetings: {
    table: 'meetings', label: 'Meeting', module: 'admin', title: 'title', subtitle: ['body', 'status'], date: 'meeting_date',
    fields: {
      title: text(req), body: text(), committee_id: ref('committees'),
      meeting_type: oneOf(['regular', 'special', 'committee', 'consultation', 'planning', 'other']),
      meeting_date: date(req), start_time: time(), end_time: time(), venue: text(), mode: oneOf(['in_person', 'online', 'hybrid']),
      role: oneOf(['secretary', 'presiding_officer', 'member', 'attendee', 'resource_person']),
      status: oneOf(['scheduled', 'held', 'postponed', 'cancelled']), presiding: text(), attendees: long(), absent: long(),
      agenda_json: json(), minutes_json: json(), minutes_status: oneOf(['none', 'draft', 'for_approval', 'approved']), remarks: long(),
    },
  },
  secretariat_records: {
    table: 'secretariat_records', label: 'Secretariat Record', module: 'admin', title: 'title', subtitle: ['record_no', 'status'], date: 'record_date',
    fields: {
      record_type: oneOf(['resolution', 'minutes', 'notice_of_meeting', 'certification', 'memorandum', 'referendum', 'excerpt', 'other'], req),
      record_no: text(), title: text(req), issuing_body: text(), meeting_id: ref('meetings'), record_date: date(),
      status: oneOf(['draft', 'for_signature', 'signed', 'disseminated', 'archived']), signatories: long(), disseminated_to: long(), remarks: long(),
    },
  },
  daily_logs: {
    table: 'daily_logs', label: 'Daily Log Entry', module: 'admin', title: 'activity', subtitle: ['category', 'output'], date: 'log_date',
    fields: {
      log_date: date(req), start_time: time(), end_time: time(), activity: text({ required: true, max: 2000 }),
      category: oneOf(['correspondence', 'meeting', 'secretariat', 'records', 'clerical', 'coordination', 'reports', 'teaching', 'research', 'extension', 'other']),
      output: text(), quantity: int({ min: 0, max: 100000 }), remarks: long(),
    },
  },
  turnover_documents: {
    table: 'turnover_documents', label: 'Turnover Document', module: 'admin', title: 'title', subtitle: ['office', 'status'], date: 'effective_date',
    fields: {
      title: text(req), office: text(), position: text(), successor_name: text(), successor_position: text(), effective_date: date(),
      noted_by: text(), noted_by_title: text(), status: oneOf(['draft', 'final']), notes_json: json(),
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

// Text inside these JSON documents is searchable too.
const SEARCH_JSON = { syllabi: ['content_json'], materials: ['content_json'], tos: ['content_json'], rubrics: ['criteria_json'],
  meetings: ['agenda_json', 'minutes_json'], turnover_documents: ['notes_json'] };
for (const [k, fields] of Object.entries(SEARCH_JSON)) if (RESOURCES[k]) RESOURCES[k].searchJson = fields;

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
export const DATE_ORDER = [['start_date', 'end_date'], ['registration_date', 'valid_until'], ['start_time', 'end_time']];

export const byTable = Object.fromEntries(Object.values(RESOURCES).map((r) => [r.table, r]));
