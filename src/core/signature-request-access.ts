import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin, json } from './utils.js';

export async function handleSecureSignatureMine(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);if(url.pathname!=='/api/education/signatures/mine')return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);const tenantId=url.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,url.searchParams.get('course_id')||undefined);
    const rows=(await env.DB.prepare(`SELECT r.*,d.course_id,d.document_type,d.entity_type,d.entity_id,d.title,d.snapshot_sha256,d.signature_level,d.status document_status
      FROM signature_requests r JOIN signature_documents d ON d.id=r.document_id AND d.tenant_id=r.tenant_id
      WHERE r.tenant_id=? AND r.status='pending' AND (
        r.signer_user_id=?
        OR (r.signer_user_id IS NULL AND r.signer_role='teacher' AND EXISTS(SELECT 1 FROM teacher_portal_assignments a WHERE a.tenant_id=r.tenant_id AND a.course_id=d.course_id AND a.user_id=? AND a.status='active'))
        OR (r.signer_user_id IS NULL AND r.signer_role='tenant_admin' AND ?=1)
      ) ORDER BY COALESCE(r.due_at,'9999'),r.signing_order`).bind(tenantId,auth.userId,auth.userId,auth.isPlatformAdmin||auth.role==='tenant_admin'?1:0).all<Record<string,unknown>>()).results??[];
    return json({ok:true,requests:rows});
  }catch(e){const code=String((e as Error)?.message||'SIGNATURE_REQUEST_ERROR'),status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')?403:code.includes('NOT_FOUND')?404:400;return json({ok:false,error:code},status);}
}
