import { apiBase } from './api-base';
import axios, { type AxiosError } from 'axios';

export const api = axios.create({
  baseURL: apiBase(),
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

const ACCESS = 'fx_access';
const REFRESH = 'fx_refresh';

export const tokens = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(ACCESS)),
  getRefresh: () => (typeof window === 'undefined' ? null : localStorage.getItem(REFRESH)),
  set: (a: string, r: string) => { localStorage.setItem(ACCESS, a); localStorage.setItem(REFRESH, r); },
  clear: () => { localStorage.removeItem(ACCESS); localStorage.removeItem(REFRESH); },
};

api.interceptors.request.use((config) => {
  const t = tokens.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

/**
 * Endpoints where a 401 is the answer, not a symptom.
 *
 * Signing in with the wrong password returns 401, and so does an expired
 * session — but they need opposite handling. Treating the first like the
 * second reloads the page before the form can render "Invalid credentials",
 * so the member sees their input vanish and nothing explaining why.
 */
const PUBLIC_AUTH = [
  '/auth/login', '/auth/register', '/auth/refresh', '/auth/2fa/challenge',
  '/auth/forgot-password', '/auth/reset-password',
];
const isPublicAuth = (url?: string) =>
  !!url && PUBLIC_AUTH.some((p) => url.startsWith(p));

/** Already on an auth screen? Redirecting there again just wipes the form. */
const onAuthScreen = () =>
  typeof window !== 'undefined' &&
  /^\/(login|register|forgot-password|reset-password)/.test(window.location.pathname);

// One transparent refresh attempt on 401, then bounce to login.
let refreshing: Promise<string | null> | null = null;
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (
      error.response?.status !== 401 || !original || original._retried ||
      isPublicAuth(original.url)          // let the form show the real message
    ) throw error;

    original._retried = true;
    refreshing ??= (async () => {
      const rt = tokens.getRefresh();
      if (!rt) return null;
      try {
        const { data } = await axios.post(`${apiBase()}/auth/refresh`, { refreshToken: rt });
        tokens.set(data.data.accessToken, data.data.refreshToken);
        return data.data.accessToken as string;
      } catch { return null; }
    })();

    const fresh = await refreshing;
    refreshing = null;
    if (!fresh) {
      tokens.clear();
      if (typeof window !== 'undefined' && !onAuthScreen()) {
        window.location.href = '/login?expired=1';
      }
      throw error;
    }
    original.headers.set('Authorization', `Bearer ${fresh}`);
    return api.request(original);
  },
);

export interface ApiEnvelope<T> { success: boolean; data: T }

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get<ApiEnvelope<T>>(url, { params });
  return data.data;
}
/**
 * `idempotencyKey` is required by every endpoint that moves money — it is what
 * lets the server tell a retry apart from a second, deliberate request. Supply
 * it from `useMoneyMutation`, which keeps one key per submission.
 */
export async function post<T>(url: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const { data } = await api.post<ApiEnvelope<T>>(url, body, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
  return data.data;
}
export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.patch<ApiEnvelope<T>>(url, body);
  return data.data;
}

export async function del<T>(url: string): Promise<T> {
  const { data } = await api.delete<ApiEnvelope<T>>(url);
  return data.data;
}

/**
 * Ends the session on the server too. Clearing localStorage only makes this
 * browser forget the token — the refresh token would still be valid for 30
 * days to anyone else holding a copy.
 */
export async function logout() {
  const refreshToken = tokens.getRefresh();
  if (refreshToken) {
    try { await axios.post(`${apiBase()}/auth/logout`, { refreshToken }); } catch { /* best effort */ }
  }
  tokens.clear();
}

/** Fetches a protected file as a blob — attachments, documents, exports. */
export async function getBlob(url: string): Promise<Blob> {
  const { data } = await api.get<Blob>(url, { responseType: 'blob' });
  return data;
}

/**
 * Re-exported so existing imports keep working.
 *
 * The implementation moved to `lib/errors`, which distinguishes a transport
 * failure from a refusal — this used to hand back raw axios text like
 * "Network Error" on a withdrawal screen.
 */
export { apiErrorMessage } from './errors';
