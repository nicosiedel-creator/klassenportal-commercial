export function setupPage(): Response {
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Klassenportal – Ersteinrichtung</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}.center{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(460px,100%);background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:30px;box-shadow:0 18px 60px #0f172a14}.brand{font-size:1.35rem;font-weight:800;margin-bottom:8px}.muted{color:#64748b}.field{display:grid;gap:7px;margin:16px 0}.field input{width:100%;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit}.btn{width:100%;border:0;border-radius:10px;padding:11px 14px;background:#2563eb;color:#fff;font-weight:700;font:inherit;cursor:pointer}.btn:disabled{opacity:.6}.ok{color:#15803d}.error{color:#b91c1c}.note{font-size:.9rem;margin-top:14px}
  </style>
</head>
<body>
  <main class="center">
    <form class="card" id="setup">
      <div class="brand">Klassenportal – Ersteinrichtung</div>
      <p class="muted">Einmalig den Plattform-Admin anlegen. Das Bootstrap-Geheimnis wird nur direkt an deinen Cloudflare-Worker gesendet.</p>
      <label class="field">BOOTSTRAP_SECRET<input name="secret" type="password" autocomplete="off" required></label>
      <label class="field">Admin-E-Mail<input name="email" type="email" autocomplete="email" required></label>
      <label class="field">Admin-Name<input name="display_name" autocomplete="name" required></label>
      <label class="field">Neues Admin-Passwort<input name="password" type="password" minlength="10" autocomplete="new-password" required></label>
      <button class="btn" type="submit">Plattform-Admin anlegen</button>
      <p id="msg" class="note muted"></p>
    </form>
  </main>
<script>
const f=document.getElementById('setup'),m=document.getElementById('msg'),b=f.querySelector('button');
f.addEventListener('submit',async e=>{
  e.preventDefault(); b.disabled=true; m.className='note muted'; m.textContent='Wird angelegt …';
  const d=Object.fromEntries(new FormData(f));
  try{
    const r=await fetch('/api/bootstrap',{method:'POST',headers:{'content-type':'application/json','x-bootstrap-secret':d.secret},body:JSON.stringify({email:d.email,password:d.password,display_name:d.display_name})});
    const j=await r.json(); if(!r.ok) throw new Error(j.error||('HTTP '+r.status));
    m.className='note ok'; m.textContent='Fertig. Plattform-Admin wurde angelegt. Du kannst dich jetzt auf der Startseite anmelden.';
  }catch(x){m.className='note error';m.textContent=x.message;b.disabled=false;}
});
</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
