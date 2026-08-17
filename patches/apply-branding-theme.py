from pathlib import Path


def patch(path, old, new):
    p=Path(path); text=p.read_text()
    if old not in text:
        raise SystemExit(f'missing patch anchor in {path}: {old[:100]!r}')
    text=text.replace(old,new,1)
    p.write_text(text)

# Server-side persistence and safety rules.
patch('src/core/data.ts',
"export async function getSettings(env:Env,auth:CoreAuthContext,tenantId:string){ requireRole(auth,'guest'); return env.DB.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first(); }\nexport async function updateSettings",
"export async function getSettings(env:Env,auth:CoreAuthContext,tenantId:string){ requireRole(auth,'guest'); return env.DB.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first(); }\nfunction brandRgb(v:string){return [Number.parseInt(v.slice(1,3),16),Number.parseInt(v.slice(3,5),16),Number.parseInt(v.slice(5,7),16)];}\nfunction brandNearWhite(v:string){const [r,g,b]=brandRgb(v);return r>=248&&g>=248&&b>=248;}\nfunction brandLum(v:string){const c=brandRgb(v).map(x=>{const s=x/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4;});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}\nfunction brandContrast(a:string,b:string){const x=brandLum(a),y=brandLum(b),hi=Math.max(x,y),lo=Math.min(x,y);return(hi+0.05)/(lo+0.05);}\nexport async function updateSettings")
patch('src/core/data.ts',
"const portal=safeString(input.portal_name??current.portal_name,200),welcome=safeString(input.welcome_text??current.welcome_text,5000),logo=safeString(input.logo_url??current.logo_url,2048),primary=safeString(input.primary_color??current.primary_color,20),secondary=safeString(input.secondary_color??current.secondary_color,20),background=safeString(input.background_color??current.background_color,20),favicon=safeString(input.favicon_url??current.favicon_url,2048),white=Number(input.white_label??current.white_label)?1:0;\n  const color=/^#[0-9a-fA-F]{6}$/; if(!color.test(primary)||!color.test(secondary)||!color.test(background)) throw new Error('COLOR_INVALID');\n  await env.DB.prepare('UPDATE tenant_settings SET portal_name=?,welcome_text=?,logo_url=?,primary_color=?,secondary_color=?,background_color=?,favicon_url=?,custom_domain=?,white_label=?,updated_at=? WHERE tenant_id=?').bind(portal,welcome||null,logo||null,primary,secondary,background,favicon||null,currentDomain||null,white,nowIso(),tenantId).run();",
"const portal=safeString(input.portal_name??current.portal_name,200),welcome=safeString(input.welcome_text??current.welcome_text,5000),logo=safeString(input.logo_url??current.logo_url,2048),primary=safeString(input.primary_color??current.primary_color,20),secondary=safeString(input.secondary_color??current.secondary_color,20),accent=safeString(input.accent_color??current.accent_color??'#7c3aed',20),background=safeString(input.background_color??current.background_color,20),surface=safeString(input.surface_color??current.surface_color??'#f3f0ea',20),textColor=safeString(input.text_color??current.text_color??'#172033',20),favicon=safeString(input.favicon_url??current.favicon_url,2048),white=Number(input.white_label??current.white_label)?1:0;\n  const color=/^#[0-9a-fA-F]{6}$/; if(![primary,secondary,accent,background,surface,textColor].every(x=>color.test(x))) throw new Error('COLOR_INVALID');\n  if(brandNearWhite(background)||brandNearWhite(surface))throw new Error('WHITE_BACKGROUND_NOT_ALLOWED');\n  if(brandContrast(textColor,background)<4.5||brandContrast(textColor,surface)<4.5)throw new Error('BRANDING_CONTRAST_TOO_LOW');\n  await env.DB.prepare('UPDATE tenant_settings SET portal_name=?,welcome_text=?,logo_url=?,primary_color=?,secondary_color=?,accent_color=?,background_color=?,surface_color=?,text_color=?,favicon_url=?,custom_domain=?,white_label=?,updated_at=? WHERE tenant_id=?').bind(portal,welcome||null,logo||null,primary,secondary,accent,background,surface,textColor,favicon||null,currentDomain||null,white,nowIso(),tenantId).run();")

# Public portal exposes all six theme colors.
patch('src/core/public.ts',
"s.portal_name,s.welcome_text,s.logo_url,s.primary_color,s.secondary_color,s.background_color,",
"s.portal_name,s.welcome_text,s.logo_url,s.primary_color,s.secondary_color,s.accent_color,s.background_color,s.surface_color,s.text_color,")
patch('src/core/public.ts',
"primary_color:row.primary_color,secondary_color:row.secondary_color,background_color:row.background_color,",
"primary_color:row.primary_color,secondary_color:row.secondary_color,accent_color:row.accent_color,background_color:row.background_color,surface_color:row.surface_color,text_color:row.text_color,")

# Participant and class-admin portals consume the complete theme.
patch('public/class-portal.js',
"  document.documentElement.style.setProperty('--portal-secondary',safeColor(course.secondary_color,'#0f172a'));\n  document.documentElement.style.setProperty('--portal-bg',safeColor(course.background_color,'#f8fafc'));",
"  document.documentElement.style.setProperty('--portal-secondary',safeColor(course.secondary_color,'#0f172a'));\n  document.documentElement.style.setProperty('--portal-accent',safeColor(course.accent_color,'#7c3aed'));\n  document.documentElement.style.setProperty('--portal-bg',safeColor(course.background_color,'#f3efe7'));\n  document.documentElement.style.setProperty('--portal-surface',safeColor(course.surface_color,'#f3f0ea'));\n  document.documentElement.style.setProperty('--portal-text',safeColor(course.text_color,'#172033'));")
patch('public/class-admin-portal.js',
"function applyBrand(){const s=state.settings||{};document.documentElement.style.setProperty('--portal-primary',safeColor(s.primary_color,'#2563eb'));document.documentElement.style.setProperty('--portal-secondary',safeColor(s.secondary_color,'#0f172a'));document.documentElement.style.setProperty('--portal-bg',safeColor(s.background_color,'#f8fafc'));document.title=",
"function applyBrand(){const s=state.settings||{};document.documentElement.style.setProperty('--portal-primary',safeColor(s.primary_color,'#2563eb'));document.documentElement.style.setProperty('--portal-secondary',safeColor(s.secondary_color,'#0f172a'));document.documentElement.style.setProperty('--portal-accent',safeColor(s.accent_color,'#7c3aed'));document.documentElement.style.setProperty('--portal-bg',safeColor(s.background_color,'#f3efe7'));document.documentElement.style.setProperty('--portal-surface',safeColor(s.surface_color,'#f3f0ea'));document.documentElement.style.setProperty('--portal-text',safeColor(s.text_color,'#172033'));document.title=")

# Never render branded portal shells on white surfaces.
css=Path('public/vfa13-refinement.css')
text=css.read_text()
extra="""\n/* Six-color tenant theme: page and card surfaces are deliberately never hard white. */\n.portal-body{background:var(--portal-bg,#f3efe7)!important;color:var(--portal-text,#172033)!important}\n.portal-hero,.portal-section,.portal-section.wide,.portal-item,.portal-day,.class-admin-person,.class-admin-module,.class-admin-count{background:var(--portal-surface,#f3f0ea)!important;color:var(--portal-text,#172033)!important}\n.portal-hero h1,.portal-section h2,.portal-item strong,.portal-brand strong{color:var(--portal-text,#172033)!important}\n.portal-btn:not(.secondary),.portal-pill{background:var(--portal-primary,#2563eb)!important}\n.portal-btn.secondary{background:color-mix(in srgb,var(--portal-surface,#f3f0ea) 86%,var(--portal-bg,#f3efe7))!important;color:var(--portal-text,#172033)!important}\n.portal-section:nth-child(3n+2){border-left-color:var(--portal-accent,#7c3aed)!important}\n"""
if 'Six-color tenant theme' not in text: css.write_text(text+extra)

# Release guardrails.
patch('scripts/release-check.mjs',
"const vfaReferenceCss=await text('public/vfa13-reference.css');",
"const vfaReferenceCss=await text('public/vfa13-reference.css');\nconst vfaRefinementCss=await text('public/vfa13-refinement.css');\nconst brandingAssistant=await text('public/branding-assistant.js');")
patch('scripts/release-check.mjs',
"assert.ok(vfaReferenceCss.includes('#stundenplan,#aufgaben')&&vfaReferenceCss.includes('flex-wrap:wrap'),'VFA13 priorities and wrapped customer navigation must stay intact');",
"assert.ok(vfaReferenceCss.includes('#stundenplan,#aufgaben')&&vfaReferenceCss.includes('flex-wrap:wrap'),'VFA13 priorities and wrapped customer navigation must stay intact');\nassert.ok(vfaRefinementCss.includes('--portal-surface')&&vfaRefinementCss.includes('--portal-accent'),'portal must consume the complete six-color tenant theme');\nassert.ok(dataBrandingGuard(),'six-color branding must reject white backgrounds and unsafe text contrast');\nassert.ok(brandingAssistant.includes('Sechs Designvorschläge')&&brandingAssistant.includes('Farben frei zusammenstellen'),'customer branding must offer six suggestions and manual color assembly');")
# Add a tiny helper around the release check without parsing TS.
patch('scripts/release-check.mjs',
"const users=await text('src/core/users.ts');",
"const users=await text('src/core/users.ts');\nconst dataSource=await text('src/core/data.ts');\nconst dataBrandingGuard=()=>dataSource.includes('WHITE_BACKGROUND_NOT_ALLOWED')&&dataSource.includes('BRANDING_CONTRAST_TOO_LOW')&&dataSource.includes('accent_color')&&dataSource.includes('surface_color')&&dataSource.includes('text_color');")
patch('scripts/release-check.mjs',
"'0041_launch_readiness.sql']",
"'0041_launch_readiness.sql','0042_branding_palette.sql']")

print('branding theme patch applied')
