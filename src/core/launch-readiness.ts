import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { backupReadiness } from './backup-verification.js';
import { ownerLegal } from './legal.js';
import { ensureLegalDocumentSchema } from './legal-schema.js';
import { ensureOfferSchema } from './offer-schema.js';
import { mailConfigured } from './mail.js';
import { ownerMfaStatus } from './mfa.js';
import { stripeModeIfConfigured } from './stripe-mode.js';
import { tenantSecretEncryptionReady } from './tenant-secrets.js';
import { currentWorkerVersion, ensureProductionReleaseSchema, productionOriginStatus } from './production-release-state.js';

async function essentialSchema(env:Env){
  const required=['account_action_tokens','legal_configuration','legal_document_events','legal_content_reports','commercial_offer_acceptances','commercial_offer_events','backup_verifications','platform_mfa','custom_domain_requests','module_cancellations','payment_provider_events','portability_backups','audit_log','production_release_approvals','org_unit_types','org_units','course_org_units','tenant_users','org_permission_grants','org_import_batches','tenant_sso_configs','external_identities','oidc_login_states','scim_tokens','scim_groups','scim_group_members','api_tokens','integration_rate_limits','participant_import_batches','participant_import_results'];
  const rows=(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${required.map(()=>'?').join(',')})`).bind(...required).all<{name:string}>()).results??[],set=new Set(rows.map(x=>x.name));return required.filter(x=>!set.has(x));
}
export async function productionReadiness(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);await ensureProductionReleaseSchema(env);await ensureOfferSchema(env);await ensureLegalDocumentSchema(env);
  const blockers:string[]=[],warnings:string[]=[],origin=productionOriginStatus(env),version=currentWorkerVersion(env),mfa=await ownerMfaStatus(env,auth.userId),legal=await ownerLegal(env,auth),backups=await backupReadiness(env,48),missingSchema=await essentialSchema(env),stripeMode=(()=>{try{return stripeModeIfConfigured(env);}catch{return null;}})();
  if(!origin.ok)blockers.push(origin.reason!);if(!version)blockers.push('Cloudflare Worker-Versionsmetadaten fehlen; versionsgebundene Live-Freigabe ist nicht möglich');
  if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)blockers.push('Stripe Live-Konfiguration fehlt');else if(stripeMode!=='live')blockers.push('Stripe läuft noch nicht mit Live-Schlüssel');
  if(!mfa.encryptionReady)blockers.push('OWNER_MFA_ENCRYPTION_KEY fehlt oder ist ungültig');if(!mfa.enabled)blockers.push('Eigentümer-MFA ist nicht aktiviert');
  if(!mailConfigured(env))blockers.push('Transaktions-E-Mail ist nicht vollständig konfiguriert (RESEND_API_KEY, MAIL_FROM, APP_ORIGIN)');
  if(!legal.complete)blockers.push('Rechtliche Unterlagen fehlen oder sind unvollständig: Anbieter-/Impressumsdaten, Datenschutz, AGB, AVV und Supportkontakt müssen geprüft und veröffentlicht sein');
  if(!backups.ready)blockers.push(`Backup-Sicherheit nicht erfüllt: ${backups.issues.length} aktive Kunden ohne aktuelles vollständig verifiziertes Backup`);if(missingSchema.length)blockers.push(`Datenbankschema unvollständig: ${missingSchema.join(', ')}`);
  const ssoEnabled=missingSchema.includes('tenant_sso_configs')?0:Number(await env.DB.prepare('SELECT COUNT(*) AS n FROM tenant_sso_configs WHERE enabled=1').first<number>('n').catch(()=>0)||0);if(ssoEnabled&&!tenantSecretEncryptionReady(env))blockers.push('SSO ist aktiviert, aber TENANT_SECRETS_ENCRYPTION_KEY fehlt oder ist ungültig');
  const customOffer=await env.DB.prepare("SELECT pricing_enabled,customer_self_service,is_active FROM module_commerce_rules WHERE feature_key='custom_domain'").first<{pricing_enabled:number;customer_self_service:number;is_active:number}>().catch(()=>null),customNeeded=!!customOffer&&Number(customOffer.is_active)===1&&Number(customOffer.pricing_enabled)===1;
  if(customNeeded&&(!env.CLOUDFLARE_ZONE_ID||!env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_SAAS_CNAME_TARGET))blockers.push('Eigene Domains werden angeboten, aber Cloudflare for SaaS ist nicht vollständig konfiguriert');
  const providerFailures=Number(await env.DB.prepare("SELECT COUNT(*) AS n FROM payment_provider_events WHERE status='failed' AND received_at>=?").bind(new Date(Date.now()-24*3600_000).toISOString()).first<number>('n').catch(()=>0)||0);if(providerFailures)blockers.push(`${providerFailures} fehlgeschlagene Zahlungsprovider-Ereignisse in den letzten 24 Stunden`);
  const dueDeletions=Number(await env.DB.prepare("SELECT COUNT(*) AS n FROM portability_deletion_requests WHERE status='pending' AND scheduled_for<=?").bind(new Date().toISOString()).first<number>('n').catch(()=>0)||0);if(dueDeletions)warnings.push(`${dueDeletions} Kundenlöschungen haben ihre Schutzfrist erreicht und warten auf manuelle Entscheidung`);
  const expiringIntegrations=missingSchema.includes('api_tokens')?0:Number(await env.DB.prepare("SELECT (SELECT COUNT(*) FROM api_tokens WHERE revoked_at IS NULL AND expires_at BETWEEN ? AND ?) + (SELECT COUNT(*) FROM scim_tokens WHERE revoked_at IS NULL AND expires_at BETWEEN ? AND ?) AS n").bind(new Date().toISOString(),new Date(Date.now()+14*86400000).toISOString(),new Date().toISOString(),new Date(Date.now()+14*86400000).toISOString()).first<number>('n').catch(()=>0)||0);if(expiringIntegrations)warnings.push(`${expiringIntegrations} API-/SCIM-Token(s) laufen innerhalb der nächsten 14 Tage ab`);
  return{ready:blockers.length===0,blockers,warnings,checks:{productionOrigin:origin,workerVersion:!!version,liveStripe:stripeMode==='live',ownerMfa:mfa.enabled&&mfa.encryptionReady,transactionalMail:mailConfigured(env),legal:legal.complete,backups:backups.ready,schema:missingSchema.length===0,ssoSecretEncryption:!ssoEnabled||tenantSecretEncryptionReady(env),customDomainProvider:!customNeeded||!!(env.CLOUDFLARE_ZONE_ID&&env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_SAAS_CNAME_TARGET),paymentProviderFailures24h:providerFailures},workerVersion:version,backupIssues:backups.issues,checkedAt:new Date().toISOString()};
}
