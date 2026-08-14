import { handleCoreApi, handlePublicApi } from './core/router.js';
import { resolvePortabilityAuth } from './core/auth.js';
import type { Env } from './core/types.js';
import { handlePortabilityRequest, portabilityConfig, runScheduledTenantBackups } from './portability/index.js';
import { setupPage } from './setup.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/setup' || url.pathname === '/setup.html') return setupPage(request, env);
    const portability = await handlePortabilityRequest(request, env, portabilityConfig, (r) => resolvePortabilityAuth(env, r));
    if (portability) return portability;
    const api = await handleCoreApi(request, env); if (api) return api;
    const pub = await handlePublicApi(request, env); if (pub) return pub;
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await runScheduledTenantBackups(env, portabilityConfig, 'system:backup', 3);
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(new Date().toISOString()).run();
  },
};
