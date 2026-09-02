export const encoder = new TextEncoder();

export function nowIso(): string { return new Date().toISOString(); }
export function id(prefix: string): string { return `${prefix}${crypto.randomUUID()}`; }

// Framework-level outcomes must look the same on every route. Each router keeps its own domain
// status mapping but consults this first, so an authentication or authorization denial can never
// surface as a 400 "bad request", and a redacted internal error can never surface as a 400 either.
const AUTH_STATUS:Record<string,number>={
  UNAUTHENTICATED:401,LOGIN_REQUIRED:401,
  PASSWORD_CHANGE_REQUIRED:428,
  FORBIDDEN:403,FORBIDDEN_ROLE:403,FORBIDDEN_COURSE:403,FORBIDDEN_PERMISSION:403,
  PLATFORM_ADMIN_REQUIRED:403,TENANT_ADMIN_REQUIRED:403,
  TENANT_ACCESS_SUSPENDED:403,SUPPORT_READ_ONLY:403,TENANT_SUSPENDED:403,TENANT_INACTIVE:403,
  SSO_REQUIRED:401,
  INTERNAL_ERROR:500,
  ORIGIN_MISMATCH:403,CSRF_ORIGIN_MISMATCH:403,PLATFORM_ORIGIN_MISMATCH:403,
};
// Only stable, documented error codes may leave the Worker. Anything else - a raw D1 message,
// a runtime TypeError, a third-party error - would expose schema and engine details to the
// caller, so it is logged for diagnosis and reported as INTERNAL_ERROR.
export function safeErrorCode(raw:unknown):string{
  const code=String((raw as Error)?.message??raw??'').trim();
  if(/^[A-Z][A-Z0-9_]{2,80}$/.test(code))return code;
  console.error('Unhandled error surfaced to client',{detail:code.slice(0,300)});
  return 'INTERNAL_ERROR';
}

export function authStatus(code:string):number|null{return AUTH_STATUS[code]??(code.startsWith('FORBIDDEN')||code.endsWith('_ADMIN_REQUIRED')?403:null);}

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
  const requestOrigin=new URL(request.url).origin;
  const origin=request.headers.get('origin');
  const fetchSite=(request.headers.get('sec-fetch-site')||'').toLowerCase();
  if(fetchSite && fetchSite!=='same-origin') throw new Error('CSRF_ORIGIN_MISMATCH');
  if(origin){
    const allowed=new Set([requestOrigin]);
    if(appOrigin){try{allowed.add(new URL(appOrigin).origin);}catch{/* invalid config does not widen trust */}}
    if(!allowed.has(origin))throw new Error('CSRF_ORIGIN_MISMATCH');
  }
}

// Im Betrieb kommt jede Anfrage ueber https herein. Nur der lokale Lauf spricht http, und eine
// unlesbare oder fehlende Adresse gilt vorsichtshalber als sicher - dann bleibt Secure gesetzt.
export function requestIsSecure(request?: Request): boolean {
  if (!request) return true;
  try { return new URL(request.url).protocol !== 'http:'; } catch { return true; }
}

// Secure gehoert an jedes Sitzungscookie - ueber https. Ueber http verweigert WebKit ein
// Secure-Cookie vollstaendig, waehrend Chromium und Firefox die Rueckadresse davon ausnehmen.
// Gemessen im Cross-Browser-Lauf 33363859545: nach der Einrichtung meldete /api/auth/me den
// Status 200 ohne Benutzer - das Cookie war nie gespeichert worden. Ueber http entfaellt deshalb
// genau dieses eine Merkmal; HttpOnly, SameSite=Strict und Path bleiben in jedem Fall.
export function cookie(name: string, value: string, maxAge: number, secure = true): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict; Max-Age=${maxAge}`;
}

export function noCookie(name: string, secure = true): string {
  return `${name}=; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Strict; Max-Age=0`;
}
