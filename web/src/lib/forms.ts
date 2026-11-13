// Curated editor layouts for portfolio records: section grouping, plain-language labels, hints and placeholders.
// Fields not listed here fall back to an automatic label in an "Other" section.

export interface FormSection { title: string; fields: string[] }
export interface FormLayout {
  sections: FormSection[];
  labels?: Record<string, string>;
  hints?: Record<string, string>;
  placeholders?: Record<string, string>;
}

const RECORD = { title: 'Record status', fields: ['verification', 'notes'] };

export const FORMS: Record<string, FormLayout> = {
  education: {
    sections: [
      { title: 'Degree', fields: ['degree', 'major', 'status'] },
      { title: 'Institution', fields: ['institution', 'location'] },
      { title: 'Dates', fields: ['start_date', 'end_date', 'graduation_date'] },
      { title: 'Thesis and distinctions', fields: ['thesis_title', 'advisor', 'distinctions'] },
      RECORD,
    ],
    labels: { major: 'Major or specialization', start_date: 'Attendance from', end_date: 'Attendance to', status: 'Completion status', distinctions: 'Academic distinctions / honors', thesis_title: 'Thesis or dissertation title', advisor: 'Adviser' },
    hints: { location: 'City, Province / Country — shown on the right of Harvard-style CVs.', distinctions: 'One per line, e.g. Cum laude; Best Thesis Award.' },
    placeholders: { degree: 'e.g. Master of Arts in Education', major: 'e.g. Educational Management', distinctions: 'e.g. Cum laude; Best Thesis' },
  },
  licenses: {
    sections: [
      { title: 'License', fields: ['license_type', 'issuing_authority', 'registration_number'] },
      { title: 'Validity', fields: ['registration_date', 'valid_until'] },
      RECORD,
    ],
    labels: { valid_until: 'Valid until' },
    hints: { registration_number: 'Stored encrypted and shown masked.', valid_until: 'Leave blank if it does not expire. You will be reminded 60 days before expiry.' },
    placeholders: { license_type: 'e.g. Licensed Professional Teacher', issuing_authority: 'e.g. Professional Regulation Commission' },
  },
  employment: {
    sections: [
      { title: 'Position', fields: ['position', 'employment_type', 'institution', 'office', 'location'] },
      { title: 'Period', fields: ['start_date', 'end_date', 'is_current'] },
      { title: 'Work', fields: ['responsibilities', 'accomplishments'] },
      RECORD,
    ],
    labels: { office: 'Office or department', is_current: 'Current position', employment_type: 'Employment type' },
    hints: { location: 'City, Province / Country', responsibilities: 'One per line, each starting with an action verb (Coordinated, Prepared…).', accomplishments: 'Concrete, quantified results; one per line.' },
    placeholders: { employment_type: 'e.g. Permanent, Contract of Service', position: 'e.g. Administrative Aide IV' },
  },
  appointments: {
    sections: [
      { title: 'Appointment', fields: ['academic_rank', 'faculty_designation', 'institution', 'department', 'location'] },
      { title: 'Period', fields: ['start_date', 'end_date', 'is_current'] },
      { title: 'Teaching', fields: ['teaching_responsibilities'] },
      RECORD,
    ],
    labels: { is_current: 'Current appointment', teaching_responsibilities: 'Courses handled and teaching responsibilities' },
    placeholders: { academic_rank: 'e.g. Instructor I', faculty_designation: 'e.g. Part-time faculty; Program Coordinator' },
  },
  trainings: {
    sections: [
      { title: 'Activity', fields: ['title', 'training_type', 'role'] },
      { title: 'Organizer', fields: ['organizer', 'location'] },
      { title: 'Dates and credit', fields: ['start_date', 'end_date', 'hours', 'cpd_units'] },
      RECORD,
    ],
    labels: { training_type: 'Type', role: 'Your role', organizer: 'Organizing institution', cpd_units: 'CPD units' },
    hints: { hours: 'Training hours as stated on the certificate.' },
  },
  awards: {
    sections: [
      { title: 'Award', fields: ['title', 'issuer', 'level', 'date_received'] },
      { title: 'Description', fields: ['description'] },
      RECORD,
    ],
    labels: { issuer: 'Issuing institution', level: 'Level' },
    placeholders: { level: 'e.g. Institutional, Regional, National' },
  },
  memberships: {
    sections: [
      { title: 'Affiliation', fields: ['organization', 'membership_type', 'member_id'] },
      { title: 'Period', fields: ['start_date', 'end_date', 'is_current'] },
      RECORD,
    ],
    labels: { membership_type: 'Membership type', member_id: 'Member ID', is_current: 'Currently a member' },
  },
  committees: {
    sections: [
      { title: 'Assignment', fields: ['committee', 'role', 'assignment_type', 'institution'] },
      { title: 'Period', fields: ['start_date', 'end_date', 'is_current'] },
      { title: 'Contribution', fields: ['description'] },
      RECORD,
    ],
    labels: { committee: 'Committee, secretariat or project', assignment_type: 'Type of service', is_current: 'Ongoing' },
    placeholders: { committee: 'e.g. Academic Council Secretariat', role: 'e.g. Secretary' },
  },
  portfolio_entries: {
    sections: [{ title: 'Accomplishment', fields: ['title', 'category', 'event_date', 'description'] }, { title: 'Record status', fields: ['verification'] }],
    labels: { event_date: 'Date' },
    placeholders: { category: 'e.g. accomplishment, service, recognition' },
  },
  publications: {
    sections: [
      { title: 'Publication', fields: ['title', 'authors', 'publication_type', 'status'] },
      { title: 'Venue', fields: ['venue', 'publisher', 'volume', 'issue', 'pages', 'publication_date'] },
      { title: 'Identifiers', fields: ['doi', 'url', 'indexing', 'research_project_id'] },
      RECORD,
    ],
    labels: { venue: 'Journal, book or proceedings', doi: 'DOI', url: 'Link', research_project_id: 'Research project' },
    hints: { authors: 'As they appear on the publication, e.g. Santos, M. A., & Reyes, J.', indexing: 'Record only indexing you have verified (e.g. Scopus, ACI).' },
  },
  presentations: {
    sections: [
      { title: 'Presentation', fields: ['title', 'authors', 'presentation_type'] },
      { title: 'Conference', fields: ['conference', 'location', 'presentation_date', 'research_project_id'] },
      RECORD,
    ],
    labels: { research_project_id: 'Research project' },
  },
  research_projects: {
    sections: [
      { title: 'Project', fields: ['title', 'role', 'status', 'start_date', 'end_date'] },
      { title: 'Progress', fields: ['progress_pct', 'target_sample', 'collected_sample', 'validation_status', 'ethics_status'] },
      { title: 'Design', fields: ['research_questions', 'objectives', 'methodology', 'instruments'] },
      { title: 'Governance', fields: ['ethics_reference', 'collaborators', 'funding'] },
      RECORD,
    ],
    labels: { ethics_reference: 'Ethics clearance reference', progress_pct: 'Overall progress (%)', target_sample: 'Target respondents / sample', collected_sample: 'Data collected so far', validation_status: 'Instrument validation', ethics_status: 'Ethics review' },
  },
  courses: {
    sections: [{ title: 'Course', fields: ['code', 'title', 'units', 'program', 'level'] }, { title: 'Description', fields: ['description'] }],
    labels: { code: 'Course code', units: 'Units' }, placeholders: { code: 'e.g. EDUC 101', program: 'e.g. BSEd' },
  },
  teaching_assignments: {
    sections: [{ title: 'Offering', fields: ['course_id', 'academic_year', 'semester', 'section', 'schedule', 'student_count', 'status', 'appointment_id'] }],
    labels: { course_id: 'Course', semester: 'Term', student_count: 'Students enrolled', appointment_id: 'Under appointment' }, placeholders: { academic_year: 'e.g. 2026-2027', schedule: 'e.g. MW 1:00–2:30 PM, Room 204' },
  },
  syllabi: {
    sections: [{ title: 'Syllabus version', fields: ['course_id', 'version_label', 'academic_year', 'semester', 'status'] }],
    labels: { course_id: 'Course', version_label: 'Version label' }, placeholders: { version_label: 'e.g. 2026 revision' },
  },
  learning_outcomes: {
    sections: [{ title: 'Outcome', fields: ['outcome_type', 'code', 'description', 'course_id', 'program', 'sort_order'] }],
    labels: { outcome_type: 'Type', course_id: 'Course (for CLOs)', program: 'Program (for POs)', sort_order: 'Order' },
    hints: { outcome_type: 'CLO = course learning outcome; PO = program outcome; ILO = intended learning outcome.' },
    placeholders: { code: 'e.g. CLO1 or PO-a', description: 'Begin with a measurable verb: Explain, Design, Evaluate…' },
  },
  materials: {
    sections: [{ title: 'Material', fields: ['title', 'material_type', 'status', 'course_id', 'teaching_assignment_id', 'week_no', 'clo_codes', 'event_date'] }, { title: 'Content', fields: ['description'] }],
    labels: { material_type: 'Type', course_id: 'Course', teaching_assignment_id: 'Class / offering', week_no: 'Week', clo_codes: 'CLOs addressed', event_date: 'Date used' },
    hints: { description: 'For lesson plans: objectives, materials, procedure (motivation, presentation, practice, assessment) and assignment.', clo_codes: 'e.g. CLO1, CLO2' },
  },
  assessments: {
    sections: [{ title: 'Assessment', fields: ['title', 'assessment_type', 'status', 'course_id', 'teaching_assignment_id', 'scheduled_date', 'item_count', 'total_points', 'clo_codes'] }],
    labels: { assessment_type: 'Type', course_id: 'Course', teaching_assignment_id: 'Class / offering', item_count: 'Number of items', clo_codes: 'CLOs assessed' },
  },
  class_activities: {
    sections: [{ title: 'Class session', fields: ['teaching_assignment_id', 'activity_date', 'title', 'activity_type', 'present', 'enrolled'] }, { title: 'Notes', fields: ['description', 'notes'] }],
    labels: { teaching_assignment_id: 'Class / offering', activity_date: 'Date', present: 'Students present', enrolled: 'Students enrolled', description: 'What was done' },
  },
  development_goals: {
    sections: [{ title: 'Goal', fields: ['goal_area', 'title', 'status', 'progress_pct', 'target_date', 'linked_training_id'] }, { title: 'Details', fields: ['description'] }],
    labels: { goal_area: 'Area', progress_pct: 'Progress (%)', linked_training_id: 'Related training' },
    placeholders: { title: 'e.g. Earn 24 units toward a PhD in Educational Management' },
  },
  extension_projects: {
    sections: [
      { title: 'Project', fields: ['title', 'project_type', 'status', 'role', 'partner', 'location', 'start_date', 'end_date'] },
      { title: 'Reach', fields: ['beneficiaries', 'participants_count', 'training_hours'] },
      { title: 'Report', fields: ['objectives', 'narrative', 'outcomes'] },
      RECORD,
    ],
    labels: { partner: 'Partner / community', role: 'Your role', participants_count: 'Participants', training_hours: 'Training hours' },
  },
};

export const VERIFICATION_INFO: Record<string, { label: string; cls: string; desc: string }> = {
  self_reported: { label: 'Self-reported', cls: '', desc: 'Entered by you; not yet confirmed or evidenced.' },
  user_confirmed: { label: 'Confirmed', cls: 'violet', desc: 'You have confirmed this record is accurate.' },
  evidence_verified: { label: 'Evidenced', cls: 'ok', desc: 'Supporting evidence is linked to this record.' },
};
