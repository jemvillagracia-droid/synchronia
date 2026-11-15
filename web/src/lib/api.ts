export class ApiError extends Error {
  status: number;
  details?: Record<string, string>;
  constructor(status: number, message: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => { unauthorizedListeners.add(fn); return () => { unauthorizedListeners.delete(fn); }; };

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Synchronia': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) unauthorizedListeners.forEach((l) => l());
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** Tiny pub/sub so any mutation can tell dashboards to refresh. */
const dataListeners = new Set<Listener>();
export const onDataChanged = (fn: Listener) => { dataListeners.add(fn); return () => { dataListeners.delete(fn); }; };
export const dataChanged = () => dataListeners.forEach((l) => l());

/** Send a file's raw bytes (e.g. a .docx) to an import endpoint. */
export async function uploadFile<T>(url: string, file: File, accept: { ext: RegExp; refuse: string; maxMb?: number } = { ext: /\.docx$/i, refuse: 'is not a Word (.docx) document. Open it in Word and use Save As → .docx.' }): Promise<T> {
  if (!accept.ext.test(file.name)) throw new ApiError(415, `“${file.name}” ${accept.refuse}`);
  const max = accept.maxMb ?? 25;
  if (file.size > max * 1048576) throw new ApiError(413, `“${file.name}” is larger than ${max} MB.`);
  const res = await fetch(`/api${url}`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Synchronia': '1', 'X-Filename': encodeURIComponent(file.name) },
    body: file,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Upload failed (${res.status})`, data?.details);
  return data as T;
}
