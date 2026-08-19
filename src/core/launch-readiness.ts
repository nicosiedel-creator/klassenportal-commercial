import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { backupReadiness } from './backup-verification.js';
import { ownerLegal } from './legal.js';
import { ensureLegalDocumentSchema } from './legal-schema.js';
import { ensureOfferSchema } from './offer-schema.js';
import { mailConfigured } from './mail.js';
import { dataResidencyStatus, configuredMailProvider } from './data-residency.js';
import { ownerMfaStatus } from './mfa.js';
import { stripeModeIfConfigured } from './stripe-mode.js';
import { tenantSecretEncryptionReady } from './tenant-secrets.js';
import { currentWorkerVersion, ensureProductionReleaseSchema, productionOriginStatus } from './production-release-state.js';

async function essentialSchema(env:Env){
  const required=['account_action_tokens','legal_configuration','legal_document_events','legal_content_reports','commercial_offer_acceptances','commercial_offer_events','backup_verifications','platform_mfa','custom_domain_requests','module_cancellations','payment_provider_events','portability_backups','audit_log','production_release_approvals','org_unit_types','org_units','course_org_units','tenant_users','org_permission_grants','org_import_batches','tenant_sso_configs','external_identities','oidc_login_states','scim_tokens','scim_groups','scim_group_members','api_tokens','integration_rate_limits','participant_import_batches','participant_import_results','responsibility_assignments','tenant_intake_settings','intake_channels','intake_submitters','intake_upload_links','intake_public_rate_limits','intake_batches','intake_documents','intake_webhook_events','automation_tasks','automation_events','communication_messages','communication_targets','communication_recipients','communication_events','communication_email_deliveries','attendance_sessions','attendance_records','absence_notices','classbook_entries','attendance_policies','attendance_events','teacher_portal_assignments','certificate_templates','certificate_records','certificate_events','workflow_rules','workflow_runs','assignment_submissions','assignment_submission_files','gradebook_items','gradebook_scores','gradebook_events','timetable_target_aliases','gradebook_categories','grading_scales','grading_scale_items','quiz_banks','quiz_questions','quiz_question_options','quizzes','quiz_question_links','quiz_attempts','quiz_answers','course_templates','course_clone_jobs','push_subscriptions','push_outbox','discussion_threads','discussion_messages','report_definitions','integration_outbox','accounting_settings','accounting_accounts','accounting_mappings','accounting_entries','accounting_lines','accounting_period_locks','accounting_expenses','accounting_reconciliation','accounting_export_runs','accounting_events','accounting_bank_transactions','accounting_dunning_cases','accounting_close_checks','accounting_autopilot_events'];
  const rows=(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${required.map(()=>'?').join(',')})`).bind(...required).all<{name:string}>()).results??[],set=new Set(rows.map(x=>x.name));return required.filter(x=>!set.has(x));
}
async function count(env:Env,sql:string,values:unknown[]=[]):Promise<number>{const stmt=env.DB.prepare(sql),bound=values.length?stmt.bind(...values):stmt;return Number(await bound.first<number>('n')||0);}

export async function productionReadiness(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);await ensureProductionReleaseSchema(env);await ensureOfferSchema(env);await ensureLegalDocumentSchema(env);
  const blockers:string[]=[],warnings:string[]=[],origin=productionOriginStatus(env),version=currentWorkerVersion(env),mfa=await ownerMfaStatus(env,auth.userId),legal=await ownerLegal(env,auth),backups=await backupReadiness(env,48),missingSchema=await essentialSchema(env),residency=dataResidencyStatus(env),stripeMode=(()=>{try{return stripeModeIfConfigured(env);}catch{return null;}})();
  if(!origin.ok)blockers.push(origin.reason!);if(!version)blockers.push('Cloudflare Worker-Versionsmetadaten fehlen; versionsgebundene Live-Freigabe ist nicht möglich');
  if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)blockers.push('Stripe Live-Konfiguration fehlt');else if(stripeMode!=='live')blockers.push('Stripe läuft noch nicht mit Live-Schlüssel');
  if(!mfa.encryptionReady)blockers.push('OWNER_MFA_ENCRYPTION_KEY fehlt oder ist ungültig');if(!mfa.enabled)blockers.push('Eigentümer-MFA ist nicht aktiviert');
  if(!mailConfigured(env))blockers.push('Transaktions-E-Mail ist nicht vollständig konfiguriert (EU-Standard: MAIL_PROVIDER=brevo, BREVO_API_KEY, MAIL_FROM, APP_ORIGIN)');
  if(!residency.ready)for(const issue of residency.blockers)blockers.push(`EU-Datenhaltung nicht bestätigt: ${issue}`);
  if(!residency.checks.find(x=>x.key==='worker_eu')?.ok)warnings.push('Cloudflare Regional Services/EU-Worker-Verarbeitung ist noch nicht bestätigt; D1/R2-EU-Jurisdiktion schützt die Speicherung, nicht automatisch jede Worker-Ausführung');
  if(!residency.checks.find(x=>x.key==='metadata_eu')?.ok)warnings.push('Cloudflare EU Customer Metadata Boundary ist noch nicht bestätigt; Logs/Analytics-Metadaten dürfen daher nicht als EU-only beworben werden');
  if(!legal.complete)blockers.push('Rechtliche Unterlagen fehlen oder sind unvollständig: Anbieter-/Impressumsdaten, Datenschutz, AGB, AVV und Supportkontakt müssen geprüft und veröffentlicht sein');
  if(!backups.ready)blockers.push(`Backup-Sicherheit nicht erfüllt: ${backups.issues.length} aktive Kunden ohne aktuelles vollständig verifiziertes Backup`);if(missingSchema.length)blockers.push(`Datenbankschema unvollständig: ${missingSchema.join(', ')}`);

  let ssoEnabled=0,ssoQueryOk=!missingSchema.includes('tenant_sso_configs');
  if(ssoQueryOk){try{ssoEnabled=await count(env,'SELECT COUNT(*) AS n FROM tenant_sso_configs WHERE enabled=1');}catch{ssoQueryOk=false;blockers.push('SSO-Sicherheitsstatus konnte nicht geprüft werden; Live-Freigabe bleibt gesperrt');}}
  const ssoSecretReady=ssoQueryOk&&(!ssoEnabled||tenantSecretEncryptionReady(env));if(ssoQueryOk&&ssoEnabled&&!ssoSecretReady)blockers.push('SSO ist aktiviert, aber TENANT_SECRETS_ENCRYPTION_KEY fehlt oder ist ungültig');

  let intakeChannels=0,intakeQueryOk=!missingSchema.includes('intake_channels');
  if(intakeQueryOk){try{intakeChannels=await count(env,"SELECT COUNT(*) AS n FROM intake_channels WHERE status='active'");}catch{intakeQueryOk=false;blockers.push('Status der Eingangskanäle konnte nicht geprüft werden; Live-Freigabe bleibt gesperrt');}}
  const provider=configuredMailProvider(env),inboundConfigured=provider==='brevo'?!!(env.INBOUND_MAIL_DOMAIN&&env.BREVO_API_KEY&&env.BREVO_INBOUND_WEBHOOK_TOKEN):provider==='resend'?!!(env.INBOUND_MAIL_DOMAIN&&env.RESEND_WEBHOOK_SECRET&&env.RESEND_API_KEY):false,inboundReady=intakeQueryOk&&(!intakeChannels||inboundConfigured);
  if(intakeQueryOk&&intakeChannels&&!inboundConfigured)blockers.push('E-Mail-Vertragseingang ist angelegt, aber der sichere Eingang des gewählten Mailproviders ist nicht vollständig konfiguriert');

  let customOffer:{pricing_enabled:number;customer_self_service:number;is_active:number}|null=null,customOfferQueryOk=true;
  try{customOffer=await env.DB.prepare("SELECT pricing_enabled,customer_self_service,is_active FROM module_commerce_rules WHERE feature_key='custom_domain'").first<{pricing_enabled:number;customer_self_service:number;is_active:number}>();}catch{customOfferQueryOk=false;blockers.push('Angebotsstatus für eigene Domains konnte nicht geprüft werden; Live-Freigabe bleibt gesperrt');}
  const customNeeded=customOfferQueryOk&&!!customOffer&&Number(customOffer.is_active)===1&&Number(customOffer.pricing_enabled)===1,customProviderConfigured=!!(env.CLOUDFLARE_ZONE_ID&&env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_SAAS_CNAME_TARGET),customDomainProviderReady=customOfferQueryOk&&(!customNeeded||customProviderConfigured);
  if(customOfferQueryOk&&customNeeded&&!customProviderConfigured)blockers.push('Eigene Domains werden angeboten, aber Cloudflare for SaaS ist nicht vollständig konfiguriert');

  let providerFailures=0,paymentEventsQueryOk=!missingSchema.includes('payment_provider_events');
  if(paymentEventsQueryOk){try{providerFailures=await count(env,"SELECT COUNT(*) AS n FROM payment_provider_events WHERE status='failed' AND received_at>=?",[new Date(Date.now()-24*3600_000).toISOString()]);}catch{paymentEventsQueryOk=false;blockers.push('Zahlungsprovider-Ereignisse der letzten 24 Stunden konnten nicht geprüft werden; Live-Freigabe bleibt gesperrt');}}
  if(paymentEventsQueryOk&&providerFailures)blockers.push(`${providerFailures} fehlgeschlagene Zahlungsprovider-Ereignisse in den letzten 24 Stunden`);

  const dueDeletions=Number(await env.DB.prepare("SELECT COUNT(*) AS n FROM portability_deletion_requests WHERE status='pending' AND scheduled_for<=?").bind(new Date().toISOString()).first<number>('n').catch(()=>0)||0);if(dueDeletions)warnings.push(`${dueDeletions} Kundenlöschungen haben ihre Schutzfrist erreicht und warten auf manuelle Entscheidung`);
  const expiringIntegrations=missingSchema.includes('api_tokens')?0:Number(await env.DB.prepare("SELECT (SELECT COUNT(*) FROM api_tokens WHERE revoked_at IS NULL AND expires_at BETWEEN ? AND ?) + (SELECT COUNT(*) FROM scim_tokens WHERE revoked_at IS NULL AND expires_at BETWEEN ? AND ?) AS n").bind(new Date().toISOString(),new Date(Date.now()+14*86400000).toISOString(),new Date().toISOString(),new Date(Date.now()+14*86400000).toISOString()).first<number>('n').catch(()=>0)||0);if(expiringIntegrations)warnings.push(`${expiringIntegrations} API-/SCIM-Token(s) laufen innerhalb der nächsten 14 Tage ab`);

  return{ready:blockers.length===0,blockers,warnings,checks:{productionOrigin:origin,workerVersion:!!version,liveStripe:stripeMode==='live',ownerMfa:mfa.enabled&&mfa.encryptionReady,transactionalMail:mailConfigured(env),euDataResidency:residency.ready,euWorkerProcessing:!!residency.checks.find(x=>x.key==='worker_eu')?.ok,euMetadataBoundary:!!residency.checks.find(x=>x.key==='metadata_eu')?.ok,legal:legal.complete,backups:backups.ready,schema:missingSchema.length===0,ssoSecretEncryption:ssoSecretReady,inboundMail:inboundReady,customDomainProvider:customDomainProviderReady,paymentProviderFailures24h:paymentEventsQueryOk&&providerFailures===0},paymentProviderFailureCount24h:paymentEventsQueryOk?providerFailures:null,residency,workerVersion:version,backupIssues:backups.issues,checkedAt:new Date().toISOString()};
}