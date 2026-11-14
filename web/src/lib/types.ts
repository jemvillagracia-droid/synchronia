export type Mode = 'administrative' | 'instructor' | 'researcher' | 'faculty_development';

export interface User { id: number; email: string }

export interface LayoutItem { id: string; visible: boolean }
export interface Preferences {
  academic_mode: Mode;
  dashboard_layout: LayoutItem[];
  layout_customised: boolean;
  context_panel_open: boolean;
  sidebar_collapsed: boolean;
}

export interface FieldSpec {
  type: 'text' | 'date' | 'int' | 'real' | 'bool' | 'enum' | 'json' | 'ref' | 'secret';
  required: boolean;
  values?: string[];
  resource?: string;
  max?: number;
  min?: number;
  format?: 'time';
  partial?: boolean;
}
export interface ResourceSpec {
  label: string; module: string; title: string; subtitle: string[]; date: string | null;
  group: string | null; recommended: string[];
  fields: Record<string, FieldSpec>;
}
export type Schema = Record<string, ResourceSpec>;

export interface RecordRow {
  id: number; _type: string; _title: string; created_at: string; updated_at: string; deleted_at?: string | null;
  _missing?: string[]; _evidence_count?: number;
  [k: string]: any;
}

export interface Task {
  id: number; title: string; due_date: string | null; priority: string; module: string; status: string;
  is_deadline: boolean; overdue: boolean;
}

export interface Nexus {
  command?: import('../components/CommandDisplay').Command;
  generated_at: string; today: string; mode: Mode;
  layout: LayoutItem[]; layout_customised: boolean;
  widgets: { id: string; title: string }[];
  profile: {
    full_name: string | null; professional_title: string | null; academic_designation: string | null; specialization: string | null;
    current_position: string | null; current_office: string | null; current_institution: string | null; career_goal: string | null;
    current_appointment: { academic_rank: string; institution: string; department: string | null; start_date: string | null } | null;
    completeness: { filled: number; total: number; missing: string[] };
  };
  development: {
    groups: { key: string; label: string; count: number }[];
    total_records: number; evidenced: number; groups_covered: number;
    verification: Record<string, number>;
  };
  teaching: Record<string, number>;
  research: {
    projects_by_status: Record<string, number>; projects: number;
    publications_by_status: Record<string, number>; publications: number; published: number; presentations: number;
  };
  extension: { by_status: Record<string, number>; total: number; recent: { id: number; title: string; status: string; start_date: string | null }[] };
  pd: {
    total: number; hours: number; cpd_units: number; year: string; year_total: number; year_hours: number; year_cpd_units: number;
    recent: { id: number; title: string; organizer: string | null; start_date: string | null; hours: number | null }[];
  };
  deadlines: { items: Task[]; undated_open: number };
  admin: {
    open_tasks: { id: number; title: string; due_date: string | null; priority: string; status: string }[];
    correspondence_pending: number; follow_ups: number; incoming: number; outgoing: number;
  };
  recent_records: { type: string; id: number; title: string; updated_at: string; label: string; module: string; is_new: boolean }[];
  accomplishments: { type: string; id: number; title: string; event_date: string | null; verification: string | null; label: string }[];
  recent_cvs: { profiles: number; exports: { id: number; file_name: string; format: string; created_at: string; profile: string }[] };
  captures: { id: number; kind: string; title: string; body: string | null; event_date: string | null; created_at: string }[];
  recent_changes: { id: number; entity_type: string; entity_id: number; action: string; summary: string; at: string }[];
}

export interface SearchResult { type: string; id: number; title: string; title_highlighted?: string; snippet: string; label: string; module: string }
export interface Notification { id: string; type: string; entity_id: number; level: 'critical' | 'warning' | 'info'; title: string; detail: string }

export interface PortfolioSummary {
  today: string;
  totals: { total: number; evidenced: number; confirmed: number; incomplete: number };
  categories: { key: string; label: string; resources: string[]; total: number; evidenced: number; confirmed: number; incomplete: number; last_updated: string | null; attention_count: number }[];
  attention: { type: string; id: number; title: string; label: string; missing: string[]; has_evidence: boolean; verification: string; category: string }[];
  profile: { full_name: string | null; professional_title: string | null; completeness: { filled: number; total: number } };
  development: { hours: number; cpd_units: number };
  licences: { expired: number; expiring: number };
}
