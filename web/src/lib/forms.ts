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
      { title: 'Activity', fields: ['title', 'training_type', 'role', 'ld_type'] },
      { title: 'Conducted or sponsored by', fields: ['organizer', 'location'] },
      { title: 'Dates and credit', fields: ['start_date', 'end_date', 'hours', 'cpd_units'] },
      RECORD,
    ],
    labels: { training_type: 'Type', role: 'Your role', ld_type: 'Type of L&D (PDS)', organizer: 'Conducted / sponsored by', cpd_units: 'CPD units' },
    hints: { hours: 'Training hours as stated on the certificate.', ld_type: 'As asked in the Personal Data Sheet: Managerial, Supervisory, Technical or Foundation.' },
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
      { title: 'Project', fields: ['title', 'role', 'research_area', 'tags', 'start_date', 'end_date'] },
      { title: 'Idea and concept', fields: ['problem', 'research_questions', 'objectives', 'significance', 'variables', 'population', 'theory'] },
      { title: 'Design', fields: ['methodology', 'target_sample', 'collected_sample'] },
      { title: 'Earlier notes', fields: ['instruments', 'ethics_reference', 'collaborators', 'funding'] },
      RECORD,
    ],
    labels: { title: 'Research title or working title', research_area: 'Research area', tags: 'Tags (comma-separated)', problem: 'Research problem or observation',
      research_questions: 'Preliminary research questions', variables: 'Potential variables or concepts', population: 'Possible research population',
      theory: 'Potential theoretical foundations', significance: 'Research significance', ethics_reference: 'Ethics clearance reference',
      target_sample: 'Target respondents / sample', collected_sample: 'Data collected so far', instruments: 'Instrument notes', collaborators: 'Collaborator notes', funding: 'Funding notes' },
  },
  school_calendar: {
    sections: [{ title: 'School calendar date', fields: ['title', 'start_date', 'end_date', 'kind', 'no_classes', 'notes'] }],
    labels: { start_date: 'Date (or first day)', end_date: 'Last day (for a range)', kind: 'Type', no_classes: 'No classes on these days' },
  },
  research_milestones: {
    sections: [{ title: 'Milestone', fields: ['project_id', 'title', 'due_date', 'status', 'completed_on', 'notes'] }],
    labels: { project_id: 'Research project', completed_on: 'Completed on' },
  },
  research_documents: {
    sections: [{ title: 'Document', fields: ['title', 'kind', 'project_id', 'target', 'word_limit', 'status'] }, { title: 'Requirements', fields: ['requirements', 'notes'] }],
    labels: { project_id: 'Research project', kind: 'Type', target: 'Target journal, conference or office', word_limit: 'Word limit', requirements: 'Formatting requirements' },
  },
  literature: {
    sections: [
      { title: 'Reference', fields: ['item_type', 'title', 'authors', 'year', 'source', 'volume', 'issue', 'pages', 'publisher', 'doi', 'url'] },
      { title: 'Review', fields: ['abstract', 'objectives', 'methodology', 'findings', 'limitations', 'relevance', 'citations', 'notes'] },
      { title: 'Organisation', fields: ['theme', 'tags'] },
    ],
    labels: { item_type: 'Type', authors: 'Authors (Family, Given; Family, Given)', source: 'Journal, book or proceedings', doi: 'DOI', url: 'Source link', findings: 'Major findings',
      limitations: 'Research limitations', relevance: 'Relevance to my research', citations: 'Potential citations (quotes, pages)', notes: 'Personal research notes', theme: 'Theme', tags: 'Tags' },
  },
  research_instruments: {
    sections: [{ title: 'Instrument', fields: ['title', 'origin', 'purpose', 'source'] }, { title: 'Permission', fields: ['permission_status', 'permission_notes'] },
      { title: 'Results obtained elsewhere', fields: ['external_results', 'notes'] }],
    labels: { origin: 'Developed, adopted or adapted', source: 'Source (for adopted or adapted instruments)', external_results: 'Externally obtained results (e.g. reliability reported by a statistician)' },
  },
  instrument_reviews: {
    sections: [{ title: 'Expert review', fields: ['instrument_id', 'version_id', 'validator', 'credentials', 'review_date', 'recommendation', 'rating', 'comments', 'addressed'] }],
    labels: { instrument_id: 'Instrument', version_id: 'Version reviewed', rating: 'Rating or score given', addressed: 'Comments addressed in a revision' },
  },
  ethics_reviews: {
    sections: [{ title: 'Ethics review', fields: ['project_id', 'committee', 'status', 'submission_date', 'approval_date', 'reference_no'] },
      { title: 'Revisions and conditions', fields: ['required_revisions', 'revisions_due', 'conditions', 'expiry_date', 'notes'] }],
    labels: { project_id: 'Research project', committee: 'Ethics committee', reference_no: 'Reference or approval number', expiry_date: 'Expires / renew by' },
  },
  research_submissions: {
    sections: [{ title: 'Submission', fields: ['title', 'kind', 'venue', 'status', 'project_id', 'document_id'] },
      { title: 'Dates', fields: ['submission_date', 'revision_due', 'resubmission_date', 'acceptance_date', 'publication_date'] },
      { title: 'Details', fields: ['revision_requests', 'conference_details', 'doi', 'url', 'notes'] }],
    labels: { kind: 'Journal, conference, book…', venue: 'Target journal or conference', project_id: 'Research project', document_id: 'Manuscript', revision_requests: 'Revision requests', conference_details: 'Conference presentation details', doi: 'DOI', url: 'Publication link' },
  },
  research_funding: {
    sections: [{ title: 'Funding', fields: ['project_id', 'opportunity', 'organization', 'deadline', 'submission_status', 'award_status', 'amount', 'currency', 'notes'] }],
    labels: { project_id: 'Research project', opportunity: 'Funding opportunity', organization: 'Funding organisation', deadline: 'Application deadline', amount: 'Amount (if applicable)' },
  },
  research_collaborators: {
    sections: [{ title: 'Collaborator', fields: ['project_id', 'name', 'affiliation', 'project_role', 'responsibilities', 'status', 'communication_notes'] }],
    labels: { project_id: 'Research project', affiliation: 'Institutional affiliation', project_role: 'Project role', responsibilities: 'Research responsibilities' },
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
  correspondence: {
    sections: [
      { title: 'Document', fields: ['direction', 'reference_no', 'doc_type', 'subject', 'counterpart', 'office'] },
      { title: 'Dates', fields: ['document_date', 'logged_date', 'due_date'] },
      { title: 'Action', fields: ['status', 'action_required', 'action_taken', 'completed_date', 'remarks'] },
    ],
    labels: { reference_no: 'Reference / control no.', doc_type: 'Document type', counterpart: 'From (incoming) / To (outgoing)', office: 'Office concerned', document_date: 'Date of document', logged_date: 'Date logged', due_date: 'Act on by' },
    hints: { reference_no: 'Leave blank to number it automatically (IN-YYYY-0001 / OUT-YYYY-0001).', due_date: 'Shown in the follow-up tracker until the document is completed.' },
    placeholders: { subject: 'e.g. Memorandum on the submission of grades', counterpart: 'e.g. Office of the Registrar' },
  },
  meetings: {
    sections: [
      { title: 'Meeting', fields: ['title', 'body', 'committee_id', 'meeting_type', 'status'] },
      { title: 'When and where', fields: ['meeting_date', 'start_time', 'end_time', 'venue', 'mode'] },
      { title: 'Participants', fields: ['role', 'presiding', 'attendees', 'absent'] },
      { title: 'Notes', fields: ['minutes_status', 'remarks'] },
    ],
    labels: { body: 'Board / council / committee', committee_id: 'Linked assignment', role: 'Your role', presiding: 'Presiding officer', attendees: 'Present', minutes_status: 'Minutes' },
    hints: { attendees: 'One name per line.', absent: 'One name per line.', minutes_status: 'Write the minutes from the Meetings tab; this updates as you go.' },
    placeholders: { title: 'e.g. 3rd Regular Meeting of the Board of Regents', body: 'e.g. Board of Regents' },
  },
  secretariat_records: {
    sections: [
      { title: 'Record', fields: ['record_type', 'record_no', 'title', 'issuing_body', 'meeting_id', 'record_date', 'status'] },
      { title: 'Signing and dissemination', fields: ['signatories', 'disseminated_to', 'remarks'] },
    ],
    labels: { record_no: 'Number', issuing_body: 'Issuing body', meeting_id: 'From meeting', disseminated_to: 'Disseminated to' },
    hints: { record_no: 'Leave blank to number it automatically, e.g. Resolution No. 4, s. 2026.' },
    placeholders: { title: 'e.g. Approving the academic calendar for SY 2026–2027' },
  },
  daily_logs: {
    sections: [{ title: 'Activity', fields: ['log_date', 'start_time', 'end_time', 'activity', 'category', 'output', 'quantity', 'remarks'] }],
    labels: { log_date: 'Date', output: 'Output', quantity: 'Number of outputs' },
    placeholders: { activity: 'e.g. Logged and routed incoming communications', output: 'e.g. Documents logged' },
  },
  turnover_documents: {
    sections: [
      { title: 'Turnover', fields: ['title', 'office', 'position', 'effective_date', 'status'] },
      { title: 'Successor', fields: ['successor_name', 'successor_position'] },
      { title: 'Noted by', fields: ['noted_by', 'noted_by_title'] },
    ],
    labels: { position: 'Your position in that office', successor_name: 'Successor', successor_position: 'Successor’s position' },
  },
  tasks: {
    sections: [{ title: 'Task', fields: ['title', 'module', 'priority', 'status', 'due_date', 'is_deadline', 'notes'] }],
    labels: { module: 'Area', is_deadline: 'Hard deadline' },
  },
};

export const VERIFICATION_INFO: Record<string, { label: string; cls: string; desc: string }> = {
  self_reported: { label: 'Self-reported', cls: '', desc: 'Entered by you; not yet confirmed or evidenced.' },
  user_confirmed: { label: 'Confirmed', cls: 'violet', desc: 'You have confirmed this record is accurate.' },
  evidence_verified: { label: 'Evidenced', cls: 'ok', desc: 'Supporting evidence is linked to this record.' },
};
