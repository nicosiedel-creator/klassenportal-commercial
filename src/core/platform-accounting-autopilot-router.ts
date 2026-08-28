import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin, authStatus, json } from './utils.js';
import { accountingAutopilotDashboard, accountingCloseCheck, autoMatchBankTransactions, importBankStatement, refreshDunningCases } from './platform-accounting-autopilot.js';

async function body(r:Request):Promise<Record<string,unknown>>{try{return await r.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=String((e as Error)?.message||'ACCOUNTING_AUTOPILOT_ERROR');const status=authStatus(code)??(code==='UNAUTHENTICATED'?401:code==='PLATFORM_ADMIN_REQUIRED'?403:code.includes('NOT_FOUND')?404:code.includes('REQUIRED')?428:400);return json({ok:false,error:code},status);}

export async function handlePlatformAccountingAutopilotApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),p=u.pathname;if(!p.startsWith('/api/platform/accounting-autopilot'))return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);
    if(p==='/api/platform/accounting-autopilot'&&request.method==='GET')return json({ok:true,...await accountingAutopilotDashboard(env,auth)});
    if(p==='/api/platform/accounting-autopilot/bank/import'&&request.method==='POST')return json({ok:true,...await importBankStatement(env,auth,await body(request))});
    if(p==='/api/platform/accounting-autopilot/bank/match'&&request.method==='POST')return json({ok:true,...await autoMatchBankTransactions(env,auth)});
    if(p==='/api/platform/accounting-autopilot/dunning/refresh'&&request.method==='POST')return json({ok:true,...await refreshDunningCases(env,auth)});
    if(p==='/api/platform/accounting-autopilot/close-check'&&request.method==='POST'){const b=await body(request);return json({ok:true,...await accountingCloseCheck(env,auth,String(b.start||''),String(b.end||''))});}
    return json({ok:false,error:'ACCOUNTING_AUTOPILOT_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
