import { apiBase } from './api-base';
import axios, { type AxiosError } from 'axios';

const KEY = 'fx_admin_token';
const REFRESH_KEY = 'fx_admin_refresh';

export const adminApi = axios.create({
  baseURL: apiBase(),
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

export const adminToken = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(KEY)),
  getRefresh: () => (typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY)),
  set: (access: string, refresh?: string) => {
    localStorage.setItem(KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => { localStorage.removeItem(KEY); localStorage.removeItem(REFRESH_KEY); },
};

/** Ends the session server-side as well, so the refresh token stops working. */
export async function adminLogout() {
  const refreshToken = adminToken.getRefresh();
  if (refreshToken) {
    try { await axios.post(`${apiBase()}/admin/logout`, { refreshToken }); } catch { /* best effort */ }
  }
  adminToken.clear();
}

adminApi.interceptors.request.use((c) => {
  const t = adminToken.get();
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

/**
 * Access tokens last 15 minutes, so a console left open needs to refresh. One
 * attempt, then out — a refresh that fails means the session was revoked, and
 * retrying would only loop.
 */
/** A 401 from these is a real answer — a wrong password, not a dead session. */
const PUBLIC_AUTH = ['/admin/login', '/admin/refresh'];
const isPublicAuth = (url?: string) => !!url && PUBLIC_AUTH.some((p) => url.startsWith(p));
const onLoginScreen = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/admin/login');

let refreshing: Promise<string | null> | null = null;

adminApi.interceptors.response.use(
  (r) => r,
  async (e: AxiosError) => {
    const original = e.config as (typeof e.config & { _retried?: boolean }) | undefined;
    // A failed sign-in must reach the form, or the operator sees a blank
    // page reload instead of "Invalid credentials".
    if (isPublicAuth(original?.url)) throw e;

    if (e.response?.status !== 401 || !original || original._retried) {
      if (e.response?.status === 401 && typeof window !== 'undefined' && !onLoginScreen()) {
        adminToken.clear();
        window.location.href = '/admin/login';
      }
      throw e;
    }

    original._retried = true;
    refreshing ??= (async () => {
      const rt = adminToken.getRefresh();
      if (!rt) return null;
      try {
        const { data } = await axios.post(`${apiBase()}/admin/refresh`, { refreshToken: rt });
        adminToken.set(data.data.accessToken, data.data.refreshToken);
        return data.data.accessToken as string;
      } catch { return null; }
    })();

    const fresh = await refreshing;
    refreshing = null;
    if (!fresh) {
      adminToken.clear();
      if (typeof window !== 'undefined' && !onLoginScreen()) {
        window.location.href = '/admin/login';
      }
      throw e;
    }
    original.headers.set('Authorization', `Bearer ${fresh}`);
    return adminApi.request(original);
  },
);

export async function adminGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await adminApi.get<{ data: T }>(url, { params });
  return data.data;
}
/**
 * `idempotencyKey` is required by every endpoint that moves money — it is what
 * lets the server tell a retry apart from a second, deliberate action. Supply
 * it from `useMoneyMutation`, which keeps one key per submission.
 */
export async function adminPost<T>(url: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const { data } = await adminApi.post<{ data: T }>(url, body, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
  return data.data;
}

export async function adminPatch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await adminApi.patch<{ data: T }>(url, body);
  return data.data;
}
export async function adminPut<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await adminApi.put<{ data: T }>(url, body);
  return data.data;
}
export async function adminDelete<T>(url: string): Promise<T> {
  const { data } = await adminApi.delete<{ data: T }>(url);
  return data.data;
}
export const adminError = (e: unknown): string => {
  const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return err.response?.data?.error?.message ?? err.message ?? 'Request failed';
};

/** Fetches a protected file as a blob — attachments, KYC documents, exports. */
export async function adminGetBlob(url: string): Promise<Blob> {
  const { data } = await adminApi.get<Blob>(url, { responseType: 'blob' });
  return data;
}
