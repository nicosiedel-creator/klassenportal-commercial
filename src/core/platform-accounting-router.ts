import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin, json } from './utils.js';
import { accountingDashboard, approveExpense, closeAccountingPeriod, createExpense, ensureAccountingDefaults, exportAccounting, postEntry, reopenAccountingPeriod, reverseEntry, saveAccountingSettings, syncCommercialAccounting, syncStripeFees, updateAccountMapping } from './platform-accounting.js';

async function body(r:Request):Promise<Record<string,unknown>>{try{return await r.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=String((e as Error)?.message||'ACCOUNTING_ERROR');const status=code==='UNAUTHENTICATED'?401:code==='PLATFORM_ADMIN_REQUIRED'?403:code.includes('NOT_FOUND')?404:code.includes('CLOSED')||code.includes('NOT_DRAFT')||code.includes('NOT_REVERSIBLE')||code.includes('HAS_DRAFTS')?409:code.includes('REQUIRED')||code.includes('NOT_CONFIGURED')?428:400;return json({ok:false,error:code},status);}
export async function handlePlatformAccountingApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),p=u.pathname;if(!p.startsWith('/api/platform/accounting'))return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);await ensureAccountingDefaults(env,auth);
    if(p==='/api/platform/accounting'&&request.method==='GET')return json({ok:true,...await accountingDashboard(env,auth)});
    if(p==='/api/platform/accounting/settings'&&request.method==='PUT')return json({ok:true,settings:await saveAccountingSettings(env,auth,await body(request))});
    const map=p.match(/^\/api\/platform\/accounting\/mappings\/([^/]+)$/);if(map&&request.method==='PUT')return json({ok:true,...await updateAccountMapping(env,auth,decodeURIComponent(map[1]),await body(request))});
    if(p==='/api/platform/accounting/sync'&&request.method==='POST')return json({ok:true,...await syncCommercialAccounting(env,auth)});
    if(p==='/api/platform/accounting/sync-stripe-fees'&&request.method==='POST')return json({ok:true,...await syncStripeFees(env,auth)});
    if(p==='/api/platform/accounting/expenses'&&request.method==='POST')return json({ok:true,...await createExpense(env,auth,await body(request))},201);
    const approve=p.match(/^\/api\/platform\/accounting\/expenses\/([^/]+)\/approve$/);if(approve&&request.method==='POST')return json({ok:true,...await approveExpense(env,auth,decodeURIComponent(approve[1]),await body(request))});
    const post=p.match(/^\/api\/platform\/accounting\/entries\/([^/]+)\/post$/);if(post&&request.method==='POST'){await postEntry(env,auth,decodeURIComponent(post[1]));return json({ok:true});}
    const reverse=p.match(/^\/api\/platform\/accounting\/entries\/([^/]+)\/reverse$/);if(reverse&&request.method==='POST'){const b=await body(request);return json({ok:true,...await reverseEntry(env,auth,decodeURIComponent(reverse[1]),String(b.reason||''))});}
    if(p==='/api/platform/accounting/periods/close'&&request.method==='POST'){const b=await body(request);return json({ok:true,...await closeAccountingPeriod(env,auth,String(b.start||''),String(b.end||''),String(b.reason||''))});}
    const reopen=p.match(/^\/api\/platform\/accounting\/periods\/([^/]+)\/reopen$/);if(reopen&&request.method==='POST'){const b=await body(request);await reopenAccountingPeriod(env,auth,decodeURIComponent(reopen[1]),String(b.reason||''));return json({ok:true});}
    if(p==='/api/platform/accounting/export.csv'&&request.method==='GET'){const format=u.searchParams.get('format')||'ledger_csv',start=u.searchParams.get('start')||'',end=u.searchParams.get('end')||'',x=await exportAccounting(env,auth,format,start,end);return new Response('\uFEFF'+x.content,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="buchhaltung-${format}-${start}-${end}.csv"`,'cache-control':'no-store'}});}
    return json({ok:false,error:'ACCOUNTING_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
