export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder();

export function randomId(prefix = ''): string {
  return prefix + crypto.randomUUID();
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function safeFilename(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'export';
}

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /["\r\n;,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function asIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number') {
    const millis = Date.UTC(1899, 11, 30) + value * 86400000;
    const d = new Date(millis);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(value).trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const s = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'ja', 'yes', 'y', 'x'].includes(s)) return true;
  if (['0', 'false', 'nein', 'no', 'n', ''].includes(s)) return false;
  return null;
}

export function assertTenantAccess(auth: { isPlatformAdmin?: boolean; tenantIds?: string[] }, tenantId: string): void {
  if (auth.isPlatformAdmin) return;
  if (!auth.tenantIds?.includes(tenantId)) throw new Error('FORBIDDEN_TENANT');
}
