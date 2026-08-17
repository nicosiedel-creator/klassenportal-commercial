from pathlib import Path

def patch(path,old,new):
    p=Path(path);s=p.read_text()
    if old not in s: raise SystemExit(f'missing anchor: {path}: {old[:120]}')
    p.write_text(s.replace(old,new,1))

patch('src/core/data.ts',"import { sendTeamsWorkflowNotification } from './advanced-modules.js';","import { sendTeamsWorkflowNotification } from './advanced-modules.js';\nimport { ensureBrandingSchema } from './branding-schema.js';")
patch('src/core/data.ts',"export async function getSettings(env:Env,auth:CoreAuthContext,tenantId:string){ requireRole(auth,'guest'); return env.DB.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first(); }","export async function getSettings(env:Env,auth:CoreAuthContext,tenantId:string){ requireRole(auth,'guest'); await ensureBrandingSchema(env); return env.DB.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first(); }")

patch('src/core/public.ts',"import { verifyPassword } from './auth.js';","import { verifyPassword } from './auth.js';\nimport { ensureBrandingSchema } from './branding-schema.js';")
patch('src/core/public.ts',"async function coursePortalRow(env:Env,tenantSlug:string,courseCode:string){\n  const row=await env.DB.prepare(`SELECT","async function coursePortalRow(env:Env,tenantSlug:string,courseCode:string){\n  await ensureBrandingSchema(env);\n  const row=await env.DB.prepare(`SELECT")

patch('src/core/runtime-schema.ts',"import { nowIso } from './utils.js';","import { nowIso } from './utils.js';\nimport { brandingSchemaStatus, ensureBrandingSchema } from './branding-schema.js';")
patch('src/core/runtime-schema.ts',"  const notificationTrigger=await triggerExists(env,'trg_notify_announcement_after_insert');\n  return {ready:managed&&missingMaterial.length===0&&notificationTrigger&&portalLayouts,managedSetupTable:managed,missingMaterialColumns:missingMaterial,notificationTriggers:notificationTrigger,userPortalLayoutsTable:portalLayouts};","  const notificationTrigger=await triggerExists(env,'trg_notify_announcement_after_insert');\n  const branding=await brandingSchemaStatus(env);\n  return {ready:managed&&missingMaterial.length===0&&notificationTrigger&&portalLayouts&&branding.ready,managedSetupTable:managed,missingMaterialColumns:missingMaterial,notificationTriggers:notificationTrigger,userPortalLayoutsTable:portalLayouts,branding};")
patch('src/core/runtime-schema.ts',"  await ensureManagedSetup(env);await ensureMaterials(env);await ensureNotifications(env);await ensurePortalLayouts(env);","  await ensureBrandingSchema(env);await ensureManagedSetup(env);await ensureMaterials(env);await ensureNotifications(env);await ensurePortalLayouts(env);")

patch('scripts/release-check.mjs',"const dataSource=await text('src/core/data.ts');","const dataSource=await text('src/core/data.ts');\nconst brandingSchema=await text('src/core/branding-schema.ts');")
patch('scripts/release-check.mjs',"assert.ok(dataBrandingGuard(),'six-color branding must reject white backgrounds and unsafe text contrast');","assert.ok(dataBrandingGuard(),'six-color branding must reject white backgrounds and unsafe text contrast');\nassert.ok(brandingSchema.includes('ensureBrandingSchema')&&brandingSchema.includes('addColumnSafely')&&brandingSchema.includes('ALTER TABLE tenant_settings ADD COLUMN'),'branding schema must self-heal safely when deployment migrations lag');\nassert.ok(publicApi.includes('await ensureBrandingSchema(env)')&&dataSource.includes('await ensureBrandingSchema(env)')&&runtimeRouter.includes('/api/platform/system/schema'),'public/settings paths must guard the branding schema and the owner schema endpoint must remain available');")
print('runtime branding schema integration applied')
