import { handleCoreApi, handlePublicApi } from './core/router.js';
import { resolvePortabilityAuth } from './core/auth.js';
import { serveTenantLogo } from './core/branding.js';
import type { Env } from './core/types.js';
import { handlePortabilityRequest, portabilityConfig, runScheduledTenantBackups } from './portability/index.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const logo = url.pathname.match(/^\/brand\/logo\/([^/]+)$/);
    if (logo) return serveTenantLogo(env, decodeURIComponent(logo[1]));
    if (url.pathname.startsWith('/einrichtung/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Methode nicht erlaubt',{status:405});
      const assetUrl=new URL('/onboarding.html',request.url);
      return env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
    }
    const portability = await handlePortabilityRequest(request, env, portabilityConfig, (r) => resolvePortabilityAuth(env, r));
    if (portability) return portability;
    const api = await handleCoreApi(request, env); if (api) return api;
    const pub = await handlePublicApi(request, env); if (pub) return pub;
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await runScheduledTenantBackups(env, portabilityConfig, 'system:backup', 3);
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(new Date().toISOString()).run();
    await env.DB.prepare("UPDATE onboarding_invitations SET status='expired' WHERE status='open' AND expires_at <= ?").bind(new Date().toISOString()).run();
  },
};
