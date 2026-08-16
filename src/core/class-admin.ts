import type { CoreAuthContext, Env } from './types.js';
import { ensureAdvancedModuleSchema } from './advanced-modules.js';
import { requireRole } from './permissions.js';

export async function classAdminModuleShowcase(env:Env,auth:CoreAuthContext,tenantId:string){
  requireRole(auth,'class_admin');
  await ensureAdvancedModuleSchema(env);
  const rules=(await env.DB.prepare(`SELECT feature_key,display_name,description,category,sort_order
    FROM module_commerce_rules
    WHERE is_active=1
    ORDER BY sort_order,display_name`).all<Record<string,unknown>>()).results??[];
  const flags=(await env.DB.prepare('SELECT feature_key,enabled FROM feature_flags WHERE tenant_id=?').bind(tenantId).all<Record<string,unknown>>()).results??[];
  const active=new Map(flags.map(x=>[String(x.feature_key),Number(x.enabled||0)===1]));
  return rules.map(r=>({
    feature_key:String(r.feature_key),
    display_name:String(r.display_name),
    description:r.description?String(r.description):'',
    category:String(r.category||'Erweiterungen'),
    enabled:active.get(String(r.feature_key))===true,
  }));
}
