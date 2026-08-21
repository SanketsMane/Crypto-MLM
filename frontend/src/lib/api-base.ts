/**
 * Resolve the API origin at runtime.
 *
 * NEXT_PUBLIC_* values are inlined at build time, which bakes one hostname into
 * the bundle. Deriving from window.location instead means the same build works
 * from localhost, a LAN address, a container host or a preview domain — the env
 * var is still honoured when it is set, for deployments where the API lives on a
 * different host entirely.
 */
export const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? '4000';

export function apiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${API_PORT}/api/v1`;
  }
  return `http://localhost:${API_PORT}/api/v1`;
}
