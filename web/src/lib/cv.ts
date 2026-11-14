// CV Studio types (mirror server/src/cv/model.js and analyze.js)
export interface CvEntry {
  id: number; included: boolean; sort_order: number; manual: boolean; overridden: boolean; removed?: boolean;
  kind: 'item' | 'text' | 'list' | 'citation';
  source: { type: string; id: number; verification?: string | null } | null;
  missing: string[]; override: Record<string, any> | null;
  title: string | null; subtitle: string | null; dates: string | null; note: string | null;
  org?: string | null; role?: string | null; location?: string | null;
  details: string[]; text: string | null; items: string[] | null;
}
export interface CvSection {
  id: number; key: string; heading: string; default_heading: string | null; ats_heading: string | null;
  visible: boolean; custom: boolean; kind: string; source: string | string[] | null;
  sort: 'auto' | 'manual'; page_break_before: boolean;
  entries: CvEntry[]; pending: { type: string; id: number; title: string }[];
}
export interface CvSettings {
  page_size: 'letter' | 'a4' | 'folio'; margins: { top: number; right: number; bottom: number; left: number };
  font_family: string | null; font_size: number | null; section_spacing: 'compact' | 'normal' | 'relaxed';
  date_order: 'reverse' | 'chronological'; date_style: 'month_year' | 'year';
  show_photo: boolean; page_numbers: boolean; footer_text: string; hide_empty: boolean; show_license_numbers: boolean;
  keywords: string; target_position: string;
}
export interface CvView {
  id: number; name: string; cv_type: string; status: 'draft' | 'finalized'; version: number; family_id: number;
  template_key: string; template_name: string; photo_image_id: number | null; photo: { id: number; label: string } | null;
  finalized_at: string | null; created_at: string; updated_at: string; approval: any;
  settings: CvSettings; sections: CvSection[]; pending_total: number;
  versions: { id: number; version: number; status: string; finalized_at: string | null; updated_at: string }[];
}
export interface CvListItem {
  id: number; name: string; cv_type: string; status: string; version: number; family_id: number; finalized_at: string | null;
  created_at: string; updated_at: string; template_key: string; template_name: string; export_count: number; last_export_at: string | null; pending: number;
}
export interface CvCatalog {
  templates: { key: string; name: string; description: string; ats: boolean; font: string; size: number }[];
  page_sizes: { key: string; label: string }[]; fonts: string[]; pdf_available: boolean;
}
export interface Check { id: string; label: string; status: 'pass' | 'warn' | 'fail' | 'info'; detail: string; items: string[] }
export interface ChecklistItem { id: string; label: string; status: 'complete' | 'incomplete' | 'missing' | 'not_applicable'; detail: string; items: string[] }
export interface Analysis {
  mode: string;
  ats: { summary: Record<string, number>; checks: Check[]; keywords: { terms: string[]; found: string[] }; disclaimer: string };
  checklist: { items: ChecklistItem[]; counts: Record<string, number>; suggestions?: { section: string; entry: string | null; entry_id: number; overridden: boolean; original: string; suggested: string; why: string }[] };
  extracted: { pdf: string; pdf_pages: number; pdf_title: string | null; docx: string; docx_headings: string[] };
}
export interface CvExport { id: number; cv_profile_id: number; format: string; file_name: string; size_bytes: number; cv_version: number; cv_status: string; created_at: string; cv_name: string }
export interface Photo {
  id: number; label: string; original_name: string; mime_type: string; size_bytes: number; width: number; height: number;
  has_optimized: boolean; crop: any; created_at: string; is_profile_photo: boolean; used_by: { id: number; name: string; version: number }[];
}

export const CV_TYPES: Record<string, string> = {
  academic: 'Academic CV', faculty: 'Faculty CV', research: 'Research-oriented CV', administrative: 'Administrative CV',
  professional: 'Professional CV', application: 'Customized application CV', short_bio: 'Short professional biography', portfolio: 'Academic and professional portfolio CV',
};
export const FORMAT_LABEL: Record<string, string> = { docx: 'Word (DOCX)', pdf: 'PDF', docx_ats: 'ATS Word (DOCX)', pdf_ats: 'ATS PDF' };
export const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
