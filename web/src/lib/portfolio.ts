// Professional Portfolio categories (Directive Section V). Keys match the server's PORTFOLIO_GROUPS.
export interface PortfolioCategory {
  key: string;
  label: string;
  code: string;
  description: string;
  resources: { type: string; tab: string }[];
}

export const PORTFOLIO: PortfolioCategory[] = [
  { key: 'education', label: 'Educational Background', code: 'EDU', description: 'Degrees, majors, institutions, attendance and graduation dates, distinctions.', resources: [{ type: 'education', tab: 'Education' }] },
  { key: 'licenses', label: 'Professional Licenses', code: 'LIC', description: 'Licenses and eligibilities. Registration numbers are stored encrypted.', resources: [{ type: 'licenses', tab: 'Licenses' }] },
  { key: 'employment', label: 'Employment History', code: 'EMP', description: 'Positions, offices, periods, responsibilities and accomplishments.', resources: [{ type: 'employment', tab: 'Employment' }] },
  { key: 'appointments', label: 'Academic Appointments', code: 'APT', description: 'Academic rank, faculty designation, appointment periods and courses handled.', resources: [{ type: 'appointments', tab: 'Appointments' }] },
  {
    key: 'research', label: 'Research and Publications', code: 'RES', description: 'Publications, conference presentations and research projects.',
    resources: [{ type: 'publications', tab: 'Publications' }, { type: 'presentations', tab: 'Presentations' }, { type: 'research_projects', tab: 'Projects' }],
  },
  { key: 'development', label: 'Professional Development', code: 'CPD', description: 'Trainings, seminars, workshops and conferences — with hours and CPD units.', resources: [{ type: 'trainings', tab: 'Trainings' }] },
  {
    key: 'service', label: 'Institutional Service', code: 'SRV', description: 'Committees, secretariat work, administrative contributions and professional affiliations.',
    resources: [{ type: 'committees', tab: 'Service' }, { type: 'memberships', tab: 'Affiliations' }],
  },
  { key: 'awards', label: 'Awards and Recognition', code: 'AWD', description: 'Awards, honors and recognition received.', resources: [{ type: 'awards', tab: 'Awards' }] },
  { key: 'accomplishments', label: 'Accomplishments', code: 'ACC', description: 'Other accomplishments, including those captured with Quick Capture.', resources: [{ type: 'portfolio_entries', tab: 'Accomplishments' }] },
];

export const categoryByKey = Object.fromEntries(PORTFOLIO.map((c) => [c.key, c]));
export const categoryOfType = (type: string) => PORTFOLIO.find((c) => c.resources.some((r) => r.type === type));
