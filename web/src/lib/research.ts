// Research Development Workspace: shared types and helpers.
import { api, dataChanged } from './api';
import { download } from './download';

export interface Stage { key: string; label: string }
export interface NextAction { text: string; kind: string; id: number | null; urgent: boolean }
export interface Progress { done: number; total: number; pct: number | null }
export interface ProjectCard {
  id: number; title: string; stage: string; stage_label: string; role: string | null; research_area: string | null; tags: string | null;
  updated_at: string; archived_at: string | null; progress: Progress; next_action: NextAction | null;
  counts: { documents: number; literature: number; instruments: number; open_tasks: number; publications: number; presentations: number };
  ethics: { status: string; expiry_date: string | null } | null;
}
export interface Overview {
  stages: Stage[]; projects: ProjectCard[]; groups: { active: number; in_development: number; completed: number };
  captured: { id: number; title: string; body: string | null; created_at: string }[];
  manuscripts: { id: number; title: string; kind: string; status: string; target: string | null; project_id: number | null; project_title: string | null; updated_at: string; sections: number; sections_done: number; word_limit: number | null }[];
  submissions: any[]; deadlines: { date: string; kind: string; title: string; project_id: number | null; type: string; id: number; overdue: boolean }[];
  recent: { entity_type: string; entity_id: number; action: string; summary: string; at: string }[];
  counts: { publications: number; presentations: number; literature: number; instruments: number; archived: number };
  next_actions: ({ project_id: number; project: string } & NextAction)[];
}
export const KIND: Record<string, string> = { proposal: 'Research proposal', concept_paper: 'Concept paper', methodology: 'Methodology document', manuscript: 'Manuscript', other: 'Other document' };
export const INSTRUMENT_STAGES = [['initial', 'Initial instrument'], ['expert_review', 'Expert review'], ['revision', 'Revision'], ['final', 'Final instrument']] as const;

/** Generate a research document and download it (Word or PDF), reporting what verification found. */
export async function exportFile(url: string, body: Record<string, unknown>, toast: (t: string, k?: 'ok' | 'error' | 'info') => void) {
  try {
    const r = await api.post<{ file_name: string; download: string; validation?: { summary: string } }>(url, body);
    download(r.download, r.file_name);
    toast(`Saved ${r.file_name}${r.validation ? ` — ${r.validation.summary}` : ''}`, 'ok');
    dataChanged();
  } catch (e) { toast((e as Error).message, 'error'); }
}
