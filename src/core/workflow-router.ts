import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { installWorkflowPresets, listWorkflowRules, saveWorkflowRule, setWorkflowRuleEnabled } from './workflow-automation.js';
import { assertSameOrigin, authStatus, json, safeErrorCode } from './utils.js';

async function body(request:Request){try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=safeErrorCode(e),status=authStatus(code)??(code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')?403:code.includes('NOT_FOUND')?404:400);return json({ok:false,error:code},status);}
export async function handleWorkflowApi(request:Request,env:Env):Promise<Response|null>{const u=new URL(request.url),path=u.pathname;if(!path.startsWith('/api/workflows'))return null;try{assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||undefined;if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId);
  if(path==='/api/workflows'&&request.method==='GET')return json({ok:true,rules:await listWorkflowRules(env,auth,tenantId)});
  if(path==='/api/workflows'&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);await saveWorkflowRule(env,auth,tenantId,await body(request));return json({ok:true},201);}
  if(path==='/api/workflows/presets'&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,...await installWorkflowPresets(env,auth,tenantId)});}
  const enabled=path.match(/^\/api\/workflows\/([^/]+)\/enabled$/);if(enabled&&request.method==='PATCH'){await assertTenantWriteAllowed(env,tenantId);const b=await body(request);await setWorkflowRuleEnabled(env,auth,tenantId,decodeURIComponent(enabled[1]),b.enabled===true);return json({ok:true});}
  return json({ok:false,error:'WORKFLOW_ROUTE_NOT_FOUND'},404);
}catch(e){return fail(e);}}
