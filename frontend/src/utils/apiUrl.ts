/**
 * Builds a backend URL that honours VITE_API_URL (same base as apiClient).
 * Use for raw fetch() calls that need custom handling (FormData, PATCH with error bodies, etc.):
 *   fetch(apiUrl('/irm/kyc/all'), { headers: getAuthHeaders() })
 */
/**
 * Normalizes an API base URL and combines it with a relative path.
 * Strips trailing slashes from the base and ensures the path starts with a single slash.
 */
export function buildApiUrl(base: string, path: string): string {
  const trimmed = (base || '').trim().replace(/\/+$/, '');
  const normalizedBase = trimmed || '/api';
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${p}`;
}

const RAW_API_BASE_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

export function apiUrl(path: string): string {
  return buildApiUrl(RAW_API_BASE_URL, path);
}
