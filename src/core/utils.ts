export const encoder = new TextEncoder();

export function nowIso(): string { return new Date().toISOString(); }
export function id(prefix: string): string { return `${prefix}${crypto.randomUUID()}`; }

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function errorCode(error: unknown, fallback = 'INTERNAL_ERROR'): string {
  const raw = String((error as Error)?.message ?? '');
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(raw) ? raw : fallback;
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function safeString(value: unknown, max = 500): string {
  const s = String(value ?? '').trim();
  if (s.length > max) throw new Error('VALUE_TOO_LONG');
  return s;
}

export function slugify(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function b64(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromB64(s: string): Uint8Array {
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i); return out;
}
export function randomBytes(n: number): Uint8Array { const x = new Uint8Array(n); crypto.getRandomValues(x); return x; }
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
export async function sha256Text(value: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return b64(hash);
}

export function parseCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function assertSameOrigin(request: Request, appOrigin?: string): void {
  if (!['POST','PUT','PATCH','DELETE'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin) return;
  const expected = appOrigin || new URL(request.url).origin;
  if (origin !== expected) throw new Error('CSRF_ORIGIN_MISMATCH');
}

export function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function noCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
