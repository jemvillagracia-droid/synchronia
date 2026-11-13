// Navigation and module roadmap. Phase numbers follow the SYNCHRONIA directive (Section XIII).
export interface ModuleDef {
  id: string;
  path: string;
  label: string;
  code: string;
  icon: string;
  phase: number;
  summary: string;
  capabilities: { title: string; items: string[] }[];
  resources: string[];
}

export const MODULES: ModuleDef[] = [
  {
    id: 'nexus', path: '/', label: 'Central Nexus', code: '00', icon: 'nexus', phase: 1,
    summary: 'Unified academic and professional dashboard.', capabilities: [], resources: ['tasks', 'activities'],
  },
  {
    id: 'academic', path: '/academic', label: 'Academic Workspace', code: '01', icon: 'academic', phase: 4,
    summary: 'The primary functional module: teaching, research, extension and faculty development — each course with its own workspace across academic years, semesters and versions.',
    capabilities: [
      { title: 'Instruction and Teaching', items: ['Course inventory and subject assignments', 'Syllabi, outcomes and program alignment', 'Weekly plans, lesson plans, materials', 'Assessments, Tables of Specifications, rubrics'] },
      { title: 'Research', items: ['Projects, proposals, questions, methods', 'Instruments, validation, ethics references', 'Manuscripts, publications, presentations', 'Links to portfolio and CV entries'] },
      { title: 'Extension and Engagement', items: ['Extension projects and community programs', 'Trainings and seminars conducted', 'Narrative and accomplishment reports', 'Outcomes with evidence references'] },
      { title: 'Faculty Development', items: ['Development activities and CPD', 'Qualifications and competencies', 'Teaching and research development goals'] },
    ],
    resources: ['courses', 'teaching_assignments', 'syllabi', 'learning_outcomes', 'materials', 'assessments', 'tos', 'rubrics', 'research_projects', 'publications', 'presentations', 'extension_projects'],
  },
  {
    id: 'portfolio', path: '/portfolio', label: 'Professional Portfolio', code: '02', icon: 'portfolio', phase: 2,
    summary: 'The master database of your professional identity. Every record editable, searchable, classifiable and linkable to supporting evidence — nothing shown as verified without evidence or your confirmation.',
    capabilities: [
      { title: 'Identity', items: ['Professional profile', 'Educational background', 'Professional licenses — registration numbers encrypted'] },
      { title: 'Career', items: ['Employment history', 'Academic appointments', 'Institutional service and committees'] },
      { title: 'Achievement', items: ['Research and publications', 'Professional development with hours and CPD units', 'Awards and recognition'] },
      { title: 'Evidence', items: ['Evidence completeness indicators', 'Google Drive / link references per record', 'Verification status on every entry'] },
    ],
    resources: ['education', 'licenses', 'employment', 'appointments', 'trainings', 'awards', 'memberships', 'committees', 'portfolio_entries'],
  },
  {
    id: 'cv', path: '/cv', label: 'Curriculum Vitae Studio', code: '03', icon: 'cv', phase: 3,
    summary: 'Comprehensive academic CVs drawn directly from the portfolio — never disconnected copies. Two-panel editor with live, page-accurate preview and ATS-readable output.',
    capabilities: [
      { title: 'Profiles', items: ['Academic, faculty, research, administrative and application CVs', 'Draft and finalized versions — finalized never altered without confirmation'] },
      { title: 'Templates', items: ['Harvard-inspired academic (not an official Harvard template)', 'Traditional, modern, research, teaching, comprehensive', 'Minimalist ATS single-column'] },
      { title: 'Output', items: ['Genuine editable DOCX', 'Text-based PDF', 'ATS analyzer and extracted-text preview', 'Export history with descriptive filenames'] },
      { title: 'Photographs', items: ['Upload up to 100 MB (JPEG, PNG, WebP)', 'Crop, reposition, multiple portraits', 'Originals preserved, optimized copies for rendering'] },
    ],
    resources: ['cv_profiles'],
  },
  {
    id: 'intelligence', path: '/intelligence', label: 'Intelligence', code: '04', icon: 'intelligence', phase: 5,
    summary: 'Analytics and reports generated only from actual records, with source-record traceability. User-entered information is always distinguished from verified evidence.',
    capabilities: [
      { title: 'Analytics', items: ['Academic, research and extension productivity', 'Portfolio and administrative analytics', 'Date and category filtering'] },
      { title: 'Reports', items: ['Annual academic accomplishment report', 'Faculty and professional development reports', 'Research and extension reports', 'DOCX, PDF and spreadsheet output'] },
    ],
    resources: [],
  },
  {
    id: 'admin', path: '/admin', label: 'Administrative Operations', code: '05', icon: 'admin', phase: 6,
    summary: 'A streamlined workspace for current clerical responsibilities — kept deliberately secondary to the academic workspace, and reconfigurable when your role changes.',
    capabilities: [
      { title: 'Registry', items: ['Incoming and outgoing correspondence', 'Document routing', 'Follow-up tracker'] },
      { title: 'Operations', items: ['Meeting management and secretariat records', 'Daily activity log', 'Office accomplishment reports', 'Turnover documentation'] },
    ],
    resources: ['correspondence'],
  },
  {
    id: 'knowledge', path: '/knowledge', label: 'Knowledge and References', code: '06', icon: 'knowledge', phase: 7,
    summary: 'Google Drive remains your document repository. SYNCHRONIA stores references, not duplicate files — via secure OAuth when authorized, or manual links otherwise.',
    capabilities: [
      { title: 'Google Drive (when authorized)', items: ['Secure OAuth connection', 'Search and attach Drive files to records', 'Preserve Drive identifiers and links'] },
      { title: 'Manual references', items: ['External links and file references', 'Evidence attached to portfolio, research and CV entries'] },
      { title: 'Continuity', items: ['Backup and restore', 'Recovery and data portability'] },
    ],
    resources: ['file_references'],
  },
];

export const moduleById = Object.fromEntries(MODULES.map((m) => [m.id, m]));
export const modulePath = (moduleId: string) => moduleById[moduleId]?.path || '/';
