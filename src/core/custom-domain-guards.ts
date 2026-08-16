import type { Env } from './types.js';

export async function ensureCustomDomainGuards(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_verified_custom_domain_update
    BEFORE UPDATE OF custom_domain ON tenant_settings
    WHEN NEW.custom_domain IS NOT NULL AND NEW.custom_domain <> ''
     AND NOT EXISTS (SELECT 1 FROM custom_domain_requests d WHERE d.tenant_id=NEW.tenant_id AND d.hostname=NEW.custom_domain AND d.status='active')
    BEGIN SELECT RAISE(ABORT,'CUSTOM_DOMAIN_MANAGED_SEPARATELY'); END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_verified_custom_domain_insert
    BEFORE INSERT ON tenant_settings
    WHEN NEW.custom_domain IS NOT NULL AND NEW.custom_domain <> ''
     AND NOT EXISTS (SELECT 1 FROM custom_domain_requests d WHERE d.tenant_id=NEW.tenant_id AND d.hostname=NEW.custom_domain AND d.status='active')
    BEGIN SELECT RAISE(ABORT,'CUSTOM_DOMAIN_MANAGED_SEPARATELY'); END`).run();
}
