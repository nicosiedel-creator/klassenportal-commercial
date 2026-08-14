import { bootstrapPlatformAdmin } from './core/auth.js';
import type { Env } from './core/types.js';

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));
}

function render(message = '', ok = false): Response {
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Klassenportal – Ersteinrichtung</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}.center{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(460px,100%);background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:30px;box-shadow:0 18px 60px #0f172a14}.brand{font-size:1.35rem;font-weight:800;margin-bottom:8px}.muted{color:#64748b}.field{display:grid;gap:7px;margin:16px 0}.field input{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}.btn{width:100%;border:0;border-radius:10px;padding:11px 14px;background:#2563eb;color:#fff;font-weight:700;font:inherit;cursor:pointer}.ok{color:#15803d}.error{color:#b91c1c}.note{font-size:.9rem;margin-top:14px}.link{display:inline-block;margin-top:12px;color:#2563eb}
  </style>
</head>
<body>
  <main class="center">
    <form class="card" method="post" action="/setup">
      <div class="brand">Klassenportal – Ersteinrichtung</div>
      <p class="muted">Einmalig den Plattform-Admin anlegen. Die Daten werden direkt im Cloudflare-Worker verarbeitet.</p>
      ${message ? `<p class="note ${ok?'ok':'error'}">${esc(message)}</p>` : ''}
      ${ok ? `<a class="link" href="/">Zur Anmeldung</a>` : `
      <label class="field">BOOTSTRAP_SECRET<input name="secret" type="password" autocomplete="off" required></label>
      <label class="field">Admin-E-Mail<input name="email" type="email" autocomplete="email" required></label>
      <label class="field">Admin-Name<input name="display_name" autocomplete="name" required></label>
      <label class="field">Neues Admin-Passwort<input name="password" type="password" minlength="10" autocomplete="new-password" required></label>
      <button class="btn" type="submit">Plattform-Admin anlegen</button>`}
    </form>
  </main>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function setupPage(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') return render();
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  try {
    const form = await request.formData();
    const secret = String(form.get('secret') ?? '');
    const payload = {
      email: String(form.get('email') ?? ''),
      display_name: String(form.get('display_name') ?? ''),
      password: String(form.get('password') ?? ''),
    };
    const internal = new Request(new URL('/api/bootstrap', request.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bootstrap-secret': secret },
      body: JSON.stringify(payload),
    });
    const response = await bootstrapPlatformAdmin(env, internal);
    const text = await response.text();
    let data: { ok?: boolean; error?: string } = {};
    try { data = JSON.parse(text) as { ok?: boolean; error?: string }; } catch { return render(`Worker-Antwort (${response.status}): ${text.slice(0,300)}`, false); }
    if (!response.ok) return render(data.error ?? `HTTP ${response.status}`, false);
    return render('Fertig. Plattform-Admin wurde angelegt.', true);
  } catch (e) {
    return render((e as Error)?.message || 'Unbekannter Fehler', false);
  }
}
